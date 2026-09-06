// species.js — 原创种族 / 属性克制 / 技能库（正式版）
'use strict';

const ELEMENT_NAMES = { fire:'火', water:'水', grass:'草', electric:'电', ice:'冰', rock:'岩', dark:'暗', psy:'智', none:'普通' };

// 克制表 CHART[攻击属性][防御属性] = 倍率（缺省 1）
const CHART = {
  fire:     { grass:2, ice:2, water:0.5, rock:0.5, fire:0.5 },
  water:    { fire:2, rock:2, water:0.5, grass:0.5 },
  grass:    { water:2, rock:2, fire:0.5, grass:0.5, ice:0.5 },
  electric: { water:2, electric:0.5, grass:0.5, rock:0.5 },
  ice:      { grass:2, ice:0.5, fire:0.5, rock:0.5 },
  rock:     { fire:2, ice:2, rock:0.5, grass:0.5, water:0.5 },
  dark:     { psy:2, dark:0.5 },
  psy:      { dark:2, psy:0.5 },
  none:     {}
};

function typeMult(atkElement, defElement) {
  return (CHART[atkElement] && CHART[atkElement][defElement]) || 1;
}

// 技能：{id, name, element, power, unlockLv}
const SKILLS = [
  // 焰狼·弗拉姆
  { id:'f1', name:'火花喷溅',   element:'fire', power:25, unlockLv:1 },
  { id:'f2', name:'火焰利爪',   element:'fire', power:45, unlockLv:8 },
  { id:'f3', name:'烈焰冲撞',   element:'fire', power:65, unlockLv:15 },
  { id:'f4', name:'炎王咆哮',   element:'fire', power:80, unlockLv:20 },
  // 雷隼·伏特
  { id:'e1', name:'电光一闪',   element:'electric', power:25, unlockLv:1 },
  { id:'e2', name:'穿云疾喙',   element:'electric', power:45, unlockLv:8 },
  { id:'e3', name:'雷暴俯冲',   element:'electric', power:65, unlockLv:15 },
  { id:'e4', name:'天雷破空',   element:'electric', power:80, unlockLv:20 },
  // 玄龟·潮岩
  { id:'w1', name:'水花喷射',   element:'water', power:25, unlockLv:1 },
  { id:'w2', name:'岩甲冲撞',   element:'water', power:45, unlockLv:8 },
  { id:'w3', name:'怒涛翻涌',   element:'water', power:65, unlockLv:15 },
  { id:'w4', name:'沧海皇怒',   element:'water', power:80, unlockLv:20 },
  // 影豹·夜刃
  { id:'d1', name:'暗影利爪',   element:'dark', power:25, unlockLv:1 },
  { id:'d2', name:'夜色突袭',   element:'dark', power:45, unlockLv:8 },
  { id:'d3', name:'影分身击',   element:'dark', power:65, unlockLv:15 },
  { id:'d4', name:'永夜之刃',   element:'dark', power:80, unlockLv:20 },
  // 灵狐·月见
  { id:'p1', name:'念力波动的呼唤', element:'psy', power:25, unlockLv:1 },
  { id:'p2', name:'精神冲击',   element:'psy', power:45, unlockLv:8 },
  { id:'p3', name:'月华洗礼',   element:'psy', power:65, unlockLv:15 },
  { id:'p4', name:'心灵风暴',   element:'psy', power:80, unlockLv:20 },
  // 岩熊·磐岳
  { id:'r1', name:'碎石飞掷',   element:'rock', power:25, unlockLv:1 },
  { id:'r2', name:'巨岩熊掌',   element:'rock', power:45, unlockLv:8 },
  { id:'r3', name:'山崩地摇',   element:'rock', power:65, unlockLv:15 },
  { id:'r4', name:'磐岳震怒',   element:'rock', power:80, unlockLv:20 },
  // 棘龙·苍棘
  { id:'g1', name:'藤鞭抽击',   element:'grass', power:25, unlockLv:1 },
  { id:'g2', name:'尖刺飞叶',   element:'grass', power:45, unlockLv:8 },
  { id:'g3', name:'荆棘风暴',   element:'grass', power:65, unlockLv:15 },
  { id:'g4', name:'万棘之王',   element:'grass', power:80, unlockLv:20 },
  // 霜鹰·凛羽
  { id:'i1', name:'冰粒连射',   element:'ice', power:25, unlockLv:1 },
  { id:'i2', name:'霜翼利刃',   element:'ice', power:45, unlockLv:8 },
  { id:'i3', name:'凛冽暴雪',   element:'ice', power:65, unlockLv:15 },
  { id:'i4', name:'极光风暴',   element:'ice', power:80, unlockLv:20 },
  // 隐藏宠物技能（S/SS 达标解锁后才可选）
  // 幻鹿·灵霄（S）
  { id:'k1', name:'星光弹',     element:'psy', power:30, unlockLv:1 },
  { id:'k2', name:'月神之角',   element:'psy', power:50, unlockLv:8 },
  { id:'k3', name:'灵霄踏影',   element:'psy', power:68, unlockLv:15 },
  { id:'k4', name:'万象归灵',   element:'psy', power:85, unlockLv:20 },
  // 圣龙·曜天（SS）
  { id:'h1', name:'龙息扫荡',   element:'fire', power:32, unlockLv:1 },
  { id:'h2', name:'曜天龙爪',   element:'fire', power:52, unlockLv:8 },
  { id:'h3', name:'燎原烈焰',   element:'fire', power:70, unlockLv:15 },
  { id:'h4', name:'圣龙降世',   element:'fire', power:88, unlockLv:20 },
  // 中性技能（Boss / 通用）
  { id:'n1', name:'猛击',       element:'none', power:25, unlockLv:1 },
  { id:'n2', name:'强力撞击',   element:'none', power:45, unlockLv:1 },
  { id:'n3', name:'毁灭重压',   element:'none', power:65, unlockLv:1 }
];
const skillById = id => SKILLS.find(s => s.id === id);

// 种族：base 五维总和约 60；growth = 每级自动成长轮转顺序
// tier：普通 undefined / 'S'（66）/ 'SS'（72）——隐藏宠物，达到门槛才可选，亲密度加成 +5%
const SPECIES = [
  { id:'firam',  name:'焰狼·弗拉姆', element:'fire',     emoji:'🐺', base:{atk:12,def:8,hp:10,spd:10,wis:8},  growth:['atk','spd','hp','def','wis'], evo:['小焰','焰狼','炎狱狼王'], skills:['f1','f2','f3','f4'] },
  { id:'volt',   name:'雷隼·伏特',   element:'electric', emoji:'🦅', base:{atk:10,def:7,hp:8,spd:14,wis:8},   growth:['spd','atk','hp','wis','def'], evo:['雷雏','雷隼','雷霆鹏王'], skills:['e1','e2','e3','e4'] },
  { id:'tidal',  name:'玄龟·潮岩',   element:'water',    emoji:'🐢', base:{atk:8,def:13,hp:13,spd:6,wis:8},   growth:['def','hp','atk','wis','spd'], evo:['小玄','玄龟','沧海玄皇'], skills:['w1','w2','w3','w4'] },
  { id:'night',  name:'影豹·夜刃',   element:'dark',     emoji:'🐆', base:{atk:12,def:8,hp:9,spd:12,wis:8},   growth:['atk','spd','hp','wis','def'], evo:['影幼','影豹','暗夜豹王'], skills:['d1','d2','d3','d4'] },
  { id:'luna',   name:'灵狐·月见',   element:'psy',      emoji:'🦊', base:{atk:8,def:8,hp:9,spd:10,wis:13},  growth:['wis','spd','hp','atk','def'], evo:['小灵','灵狐','月神天狐'], skills:['p1','p2','p3','p4'] },
  { id:'mount',  name:'岩熊·磐岳',   element:'rock',     emoji:'🐻', base:{atk:11,def:12,hp:13,spd:5,wis:8},  growth:['hp','def','atk','wis','spd'], evo:['小磐','岩熊','磐岳巨熊'], skills:['r1','r2','r3','r4'] },
  { id:'thorn',  name:'棘龙·苍棘',   element:'grass',    emoji:'🦎', base:{atk:10,def:10,hp:11,spd:9,wis:10}, growth:['hp','atk','def','spd','wis'], evo:['苍苗','棘龙','苍棘龙王'], skills:['g1','g2','g3','g4'] },
  { id:'rime',   name:'霜鹰·凛羽',   element:'ice',      emoji:'🐧', base:{atk:9,def:9,hp:9,spd:12,wis:11},   growth:['spd','wis','hp','atk','def'], evo:['凛雏','霜鹰','凛冬之翼'], skills:['i1','i2','i3','i4'] },
  // —— 隐藏宠物（学期门槛解锁）——
  { id:'kirin',  name:'幻鹿·灵霄',   element:'psy',      tier:'S',  emoji:'🦌', base:{atk:13,def:11,hp:13,spd:13,wis:16}, growth:['wis','spd','atk','hp','def'], evo:['灵光幼鹿','幻鹿','灵霄神鹿'], skills:['k1','k2','k3','k4'], hidden:true },
  { id:'dragon', name:'圣龙·曜天',   element:'fire',     tier:'SS', emoji:'🐉', base:{atk:15,def:13,hp:15,spd:14,wis:15}, growth:['atk','def','hp','wis','spd'], evo:['曜天幼龙','圣龙','曜天圣皇'], skills:['h1','h2','h3','h4'], hidden:true }
];
const speciesById = id => SPECIES.find(s => s.id === id) || null;

// 生成 Boss：按孩子等级动态，血量与孩子同量级（单挑 0.95 倍 / 联手 1.15 倍 + 1.8 倍血）
function makeBoss(level, forCoop) {
  const mul = forCoop ? 1.15 : 0.95;
  const s = n => Math.max(1, Math.round((n + level * 0.8) * mul));
  return {
    name: forCoop ? '远古守护兽' : '荒野挑战者',
    element: 'none',
    emoji: '👹',
    level,
    stats: { atk: s(11), def: s(9), hp: s(10), spd: s(10), wis: s(10) },
    hpMax: Math.round((s(10) * 5 + level * 4) * (forCoop ? 1.8 : 1)),
    skills: ['n1', 'n2', 'n3']
  };
}

module.exports = { ELEMENT_NAMES, CHART, typeMult, SKILLS, skillById, SPECIES, speciesById, makeBoss };
