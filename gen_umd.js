// gen_umd.js — 从 lib/*.js 自动生成浏览器 UMD 版本（public/lib/*.umd.js）
// 规则：require 解构行 → 工厂参数绑定；module.exports = X → return X；包 UMD 壳。
'use strict';
const fs = require('fs');
const path = require('path');

const SPECS = [
  { src: 'species.js', out: 'species.umd.js', global: 'SpeciesMod',
    deps: [], // [源模块名, nodeRequireRel, browserExpr, param]
    nodeRequires: [], browserArgs: '', params: '' },
  { src: 'engine.js', out: 'engine.umd.js', global: 'EngineMod',
    nodeRequires: [['./species', 'species', 'root.SpeciesMod'], ['./store', 'store', 'root.LocalStore']],
    browserArgs: 'root.SpeciesMod, root.LocalStore', params: 'species, store' },
  { src: 'battle.js', out: 'battle.umd.js', global: 'BattleMod',
    nodeRequires: [['./species', 'species', 'root.SpeciesMod'], ['./engine', 'engine', 'root.EngineMod'], ['./store', 'store', 'root.LocalStore']],
    browserArgs: 'root.SpeciesMod, root.EngineMod, root.LocalStore', params: 'species, engine, store' }
];

function toCamel(mod) { return mod; }

for (const spec of SPECS) {
  let code = fs.readFileSync(path.join(__dirname, 'lib', spec.src), 'utf8');
  // 1) require 行 → 参数绑定
  code = code.replace(/(?:const|let|var)\s+\{([^}]*)\}\s*=\s*require\((['"])([^'"]+)\2\);?/g, (m, names, q, mod) => {
    const dep = spec.nodeRequires.find(d => d[0] === mod);
    if (!dep) throw new Error(`${spec.src}: 未知依赖 ${mod}`);
    const binds = names.split(',').map(s => s.trim()).filter(Boolean)
      .map(n => `var ${n} = ${dep[1]}.${n};`).join(' ');
    return binds;
  });
  code = code.replace(/(?:const|let|var)\s+(\w+)\s*=\s*require\((['"])([^'"]+)\2\);?/g, (m, name, q, mod) => {
    const dep = spec.nodeRequires.find(d => d[0] === mod);
    if (!dep) throw new Error(`${spec.src}: 未知依赖 ${mod}`);
    return `var ${name} = ${dep[1]};`;
  });
  // 2) module.exports = X → return X
  if (!/module\.exports\s*=\s*/.test(code)) throw new Error(`${spec.src}: 找不到 module.exports`);
  code = code.replace(/module\.exports\s*=\s*/, 'return ');
  // 3) UMD 壳
  const nodeReq = spec.nodeRequires.map(d => `require('../../lib/${d[0].replace('./', '')}')`).join(', ');
  const out = `// ${spec.out} — 自动生成（gen_umd.js，源：lib/${spec.src}）。勿手改，改源后重新生成。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(${nodeReq || ''});
  } else {
    root.${spec.global} = factory(${spec.browserArgs});
  }
})(typeof self !== 'undefined' ? self : this, function (${spec.params}) {
${code}
});
`;
  fs.writeFileSync(path.join(__dirname, 'public', 'lib', spec.out), out, 'utf8');
  console.log('生成', spec.out, out.length, 'bytes');
}
console.log('完成');
