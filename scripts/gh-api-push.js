#!/usr/bin/env node
/**
 * gh-api-push.js — GitHub REST API 备用推送通道
 *
 * 用途：github.com:443 被间歇性重置/阻断时（国内常见），api.github.com 往往仍通，
 *       用本脚本经 REST API 把本地提交原样推到远端，SHA 与本地保持一致。
 *
 * 用法：
 *   GH_PAT=<token> node scripts/gh-api-push.js <commit-sha> <branch>
 *   （不传 GH_PAT 时自动从 git credential manager 读取 github.com 的凭据）
 *
 * 原理：git 对象 SHA 是确定性的——按本地提交的 tree/parents/author/committer/message
 *       逐字节复刻，API 创建的提交 SHA 与本地一致，推送后本地远端零分歧。
 *
 * 注意：token 绝不硬编码在本文件；仓库必须允许 Contents: Read and write。
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const API = 'https://api.github.com';

function usage() {
  console.error('用法: GH_PAT=<token> node scripts/gh-api-push.js <commit-sha> <branch> [repo owner/name]');
  process.exit(2);
}

const [commitArg, branchArg, repoArg] = process.argv.slice(2);
if (!commitArg || !branchArg) usage();
const COMMIT = commitArg.trim();
const BRANCH = branchArg.trim();

// repo 从 git remote 自动解析（可用第三个参数覆盖）
function detectRepo() {
  if (repoArg) return repoArg;
  const url = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
  const m = url.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?\/?$/);
  if (!m) throw new Error('无法从 origin 解析 owner/name: ' + url);
  return m[1] + '/' + m[2];
}
const REPO = detectRepo();

function getToken() {
  if (process.env.GH_PAT) return process.env.GH_PAT;
  // 从 git credential manager 读（不落盘）
  // 注意：Windows 下 execSync 经 cmd.exe 执行，不支持 VAR=value 前缀，须用 env 选项
  const out = execSync('printf "host=github.com\\nprotocol=https\\n\\n" | git credential fill', {
    encoding: 'utf8',
    env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' }),
  });
  const m = out.match(/^password=(.+)$/m);
  if (!m) throw new Error('未找到 GitHub 凭据：请设置 GH_PAT 环境变量');
  return m[1].trim();
}

async function gh(p, method, body) {
  const r = await fetch(API + p, {
    method,
    headers: {
      'Authorization': 'Bearer ' + getToken(),
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'habitpet-repo-tidy',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { j = { raw: text }; }
  if (!r.ok) throw new Error(method + ' ' + p + ' -> ' + r.status + ' : ' + text.slice(0, 400));
  return j;
}

// 解析 git cat-file -p 的提交头，取 tree/parents/author/committer/message
function readLocalCommit(sha) {
  const raw = execSync('git cat-file -p ' + sha, { encoding: 'utf8' });
  const lines = raw.split('\n');
  const head = {};
  let msgStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === '') { msgStart = i + 1; break; }
    const sp = lines[i].indexOf(' ');
    const key = lines[i].slice(0, sp);
    const val = lines[i].slice(sp + 1);
    if (key === 'parent') (head.parents = head.parents || []).push(val);
    else head[key] = val;
  }
  const message = lines.slice(msgStart).join('\n');
  return { tree: head.tree, parents: head.parents || [], author: head.author, committer: head.committer, message };
}

// "Codex <codex@local> 1792151337 -0400" → {name,email,date ISO(带原偏移)}
function parseIdent(line) {
  const m = line.match(/^(.*) <([^>]*)> (\d+) ([+-]\d{4})$/);
  if (!m) throw new Error('无法解析 ident: ' + line);
  const epoch = Number(m[3]);
  const off = m[4];
  const sign = off[0] === '-' ? -1 : 1;
  const oh = Number(off.slice(1, 3)), om = Number(off.slice(3, 5));
  const offsetMs = sign * (oh * 3600 + om * 60) * 1000;
  const d = new Date(epoch * 1000 + offsetMs);
  const pad = (n) => String(n).padStart(2, '0');
  const iso = d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) +
    'T' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds()) + off.slice(0, 3) + ':' + off.slice(3);
  return { name: m[1], email: m[2], date: iso };
}

(async () => {
  const c = readLocalCommit(COMMIT);
  console.log('本地提交', COMMIT, '| tree', c.tree, '| parents', c.parents.join(','));

  const ref = await gh('/repos/' + REPO + '/git/ref/heads/' + encodeURIComponent(BRANCH), 'GET');
  console.log('远端', BRANCH, '当前 tip:', ref.object.sha);
  if (ref.object.sha !== c.parents[0]) {
    throw new Error('远端 tip 与本地父提交不一致（' + ref.object.sha + ' != ' + c.parents[0] + '），中止');
  }

  const parent = await gh('/repos/' + REPO + '/git/commits/' + c.parents[0], 'GET');

  // 变更文件（相对父提交）
  const changed = execSync('git diff-tree --no-commit-id --name-only -r ' + COMMIT, { encoding: 'utf8' })
    .split('\n').map(s => s.trim()).filter(Boolean);
  console.log('变更文件:', changed.join(', '));

  const entries = [];
  for (const f of changed) {
    const content = fs.readFileSync(path.resolve(f));
    const blob = await gh('/repos/' + REPO + '/git/blobs', 'POST', { content: content.toString('base64'), encoding: 'base64' });
    const localBlob = execSync('git rev-parse ' + COMMIT + ':' + f, { encoding: 'utf8' }).trim();
    console.log('  blob', f, '->', blob.sha, blob.sha === localBlob ? '(SHA 一致)' : '(!! 不一致 ' + localBlob + ')');
    entries.push({ path: f, mode: '100644', type: 'blob', sha: blob.sha });
  }

  const tree = await gh('/repos/' + REPO + '/git/trees', 'POST', { base_tree: parent.tree.sha, tree: entries });
  console.log('tree ->', tree.sha, tree.sha === c.tree ? '(SHA 一致)' : '(!! 不一致 ' + c.tree + ')');

  const commit = await gh('/repos/' + REPO + '/git/commits', 'POST', {
    message: c.message.endsWith('\n') ? c.message : c.message + '\n',
    tree: tree.sha,
    parents: c.parents,
    author: parseIdent(c.author),
    committer: parseIdent(c.committer),
  });
  console.log('commit ->', commit.sha, commit.sha === COMMIT ? '(SHA 一致)' : '(!! 不一致 ' + COMMIT + ')');

  const upd = await gh('/repos/' + REPO + '/git/refs/heads/' + encodeURIComponent(BRANCH), 'PATCH', { sha: commit.sha, force: false });
  console.log('已更新远端', BRANCH, '->', upd.object.sha);
  console.log('DONE');
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
