import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { computeAllFactors } from './factors/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'recommendations.json');

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

if (!DEEPSEEK_API_KEY) {
  console.error('❌ 错误: 未设置 DEEPSEEK_API_KEY 环境变量');
  process.exit(1);
}

// 代理配置：自动检测，优先直连，失败时尝试环境变量代理
let proxyAgent = null;
const envProxy = process.env.https_proxy || process.env.HTTPS_PROXY;

async function testProxy(url, agent) {
  const opts = { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 3000 };
  if (agent) opts.agent = agent;
  try {
    const res = await fetch(url, opts);
    return res.ok;
  } catch { return false; }
}

function buildFetchOptions(extraHeaders = {}) {
  const opts = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://finance.sina.com.cn/',
      ...extraHeaders
    }
  };
  if (proxyAgent) opts.agent = proxyAgent;
  return opts;
}

// 初始化：自动选择可用代理
async function initProxy() {
  const testUrl = 'https://finance.sina.com.cn/';
  console.log('🔌 检测网络连接...');

  if (await testProxy(testUrl, null)) {
    console.log('  ✅ 直连可用');
    proxyAgent = null;
    return;
  }

  if (envProxy) {
    const agent = new HttpsProxyAgent(envProxy);
    if (await testProxy(testUrl, agent)) {
      console.log(`  ✅ 代理可用: ${envProxy}`);
      proxyAgent = agent;
      return;
    }
  }

  console.log('  ⚠️ 直连和代理均不可用，将使用默认配置');
}

// ============ 数据获取函数 (Sina Finance) ============

const SINA_BASE = 'https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData';

function sinaToStock(s) {
  const trade = parseFloat(s.trade) || 0;
  const open = parseFloat(s.open) || 0;
  const high = parseFloat(s.high) || 0;
  const low = parseFloat(s.low) || 0;
  const settlement = parseFloat(s.settlement) || 1;
  return {
    f2: trade,
    f3: parseFloat(s.changepercent) || 0,
    f4: parseFloat(s.pricechange) || 0,
    f8: parseFloat(s.turnoverratio) || 0,
    f9: parseFloat(s.per) || 0,
    f10: 0,
    f12: s.code || '',
    f14: s.name || '',
    f15: high,
    f16: low,
    f17: open,
    f18: settlement,
    f20: parseFloat(s.mktcap) * 1e8 || 0,
    f21: parseFloat(s.nmc) * 1e8 || 0,
    f23: parseFloat(s.pb) || 0,
    f115: settlement > 0 ? ((high - low) / settlement * 100) : 0,
    f128: parseFloat(s.amount) || 0,
  };
}

async function fetchSinaPage(page, num, sort, asc) {
  const url = `${SINA_BASE}?page=${page}&num=${num}&sort=${sort}&asc=${asc}&node=hs_a`;
  const res = await fetch(url, buildFetchOptions());
  const text = await res.text();
  if (!text.trim().startsWith('[')) {
    console.warn(`  ⚠️ Sina返回非JSON (长度${text.length})，跳过`);
    return [];
  }
  try {
    return JSON.parse(text);
  } catch {
    console.warn(`  ⚠️ Sina JSON解析失败`);
    return [];
  }
}

async function fetchSinaAll(sort, asc, limit) {
  const all = [];
  let page = 1;
  while (all.length < limit) {
    const data = await fetchSinaPage(page, 80, sort, asc);
    if (!data.length) break;
    all.push(...data);
    page++;
    if (all.length >= limit) break;
  }
  return all.slice(0, limit).map(sinaToStock);
}

// 1. 获取全A股行情 (按涨幅排序 Top200)
async function fetchTopMovers() {
  console.log('  📈 获取涨幅榜...');
  return fetchSinaAll('changepercent', 0, 200);
}

// 2. 获取低估值股票 (按PE排序)
async function fetchLowPEStocks() {
  console.log('  💰 获取低估值股票...');
  const raw = await fetchSinaAll('per', 1, 200);
  return raw.filter(s => s.f9 > 0);
}

// 3. 获取热门概念板块 (用涨幅前200中的热门股代替)
async function fetchHotSectors() {
  console.log('  🔥 获取热门板块...');
  const all = await fetchSinaAll('changepercent', 0, 500);
  const sectors = {};
  for (const s of all) {
    const name = s.f14.slice(0, 2);
    if (!sectors[name]) sectors[name] = { f12: name, f14: name + '板块', f3: 0, f104: 0, f105: 0, count: 0 };
    sectors[name].f3 += s.f3;
    sectors[name].count++;
    if (s.f3 > 0) sectors[name].f104++;
    else sectors[name].f105++;
  }
  return Object.values(sectors)
    .map(s => ({ ...s, f3: s.count > 0 ? s.f3 / s.count : 0 }))
    .sort((a, b) => b.f3 - a.f3)
    .slice(0, 50);
}

// 4. 获取龙虎榜数据 (用成交额排行代替)
async function fetchDragonTiger() {
  console.log('  📋 获取成交额排行...');
  return fetchSinaAll('amount', 0, 50);
}

// 5. 获取市场新闻
async function fetchMarketNews() {
  try {
    const url = 'https://np-listapi.eastmoney.com/comm/web/getNewsByColumnId?columnId=102&pageNum=1&pageSize=20';
    const res = await fetch(url, buildFetchOptions());
    const json = await res.json();
    return (json?.data?.list || []).slice(0, 15).map(n => ({
      title: n.title || n.title_show || '',
      summary: n.digest || '',
      time: n.show_time || ''
    }));
  } catch (e) {
    console.warn(`  ⚠️ 新闻获取失败: ${e.message}`);
    return [];
  }
}

// ============ AI 分析 ============

function buildAnalysisPrompt(topMovers, lowPE, hotSectors, dragonTiger, news, factorResults) {
  const topMoversSample = topMovers.slice(0, 100).map(s => {
    const code = s.f12;
    const entry = {
      code, name: s.f14, price: s.f2, change: s.f3,
      pe: s.f9, pb: s.f23, mcap: +(s.f20 / 1e8).toFixed(1), turnover: s.f8
    };
    const factors = factorResults?.get(code);
    if (factors) entry.factors = factors;
    return entry;
  });

  const lowPESample = lowPE.filter(s => s.f9 > 0 && s.f9 < 20 && s.f20 > 10e8)
    .slice(0, 50).map(s => ({
      code: s.f12, name: s.f14, pe: s.f9, pb: s.f23, change: s.f3,
      mcap: +(s.f20 / 1e8).toFixed(1)
    }));

  const hotSectorSample = hotSectors.slice(0, 20).map(s => ({
    code: s.f12, name: s.f14, change: s.f3, up: s.f104, down: s.f105
  }));

  const newsTitles = news.slice(0, 10).map(n => n.title);

  return `你是一位经验丰富的A股分析师。请根据以下市场数据，推荐今日有潜力的股票。

## 因子说明
每只股票附带因子得分 (0-1)，基于Fama-French多因子模型计算：
- valuation: 估值因子 (PE/PB综合，越高越低估)
- momentum: 动量因子 (适中正动量最佳，极端涨跌分低)
- volatility: 波动因子 (振幅越低越稳)
- volume: 量价因子 (换手率/量比配合度)
- capital: 资金因子 (放量上涨=流入信号)
- composite: 综合因子得分

## 今日涨幅领先股票 (Top 100)
${JSON.stringify(topMoversSample)}

## 低估值股票 (PE<20, 市值>10亿)
${JSON.stringify(lowPESample)}

## 热门概念板块 (Top 20)
${JSON.stringify(hotSectorSample)}

## 今日市场新闻
${newsTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')}

## 任务要求
请严格按以下JSON格式返回推荐。推荐4个类别，每类3-5只股票：

1. 优先参考 composite 因子得分，避免推荐 composite < 0.4 的股票
2. 推荐理由必须引用具体因子数据（如 PE/动量/换手率等）
3. 不同类别侧重不同因子组合

{
  "marketSummary": "今日市场整体概述，50字以内",
  "categories": [
    {
      "name": "低估值精选",
      "icon": "📊",
      "description": "该类别说明",
      "stocks": [
        {
          "code": "000001",
          "name": "平安银行",
          "price": 12.50,
          "change": 2.3,
          "reason": "PE 8.5，估值因子得分0.82，低估值且动量适中"
        }
      ]
    },
    {
      "name": "热点板块",
      "icon": "🔥",
      "description": "该类别说明",
      "stocks": [...]
    },
    {
      "name": "新闻驱动",
      "icon": "📰",
      "description": "该类别说明",
      "stocks": [...]
    },
    {
      "name": "技术形态",
      "icon": "📈",
      "description": "该类别说明",
      "stocks": [...]
    }
  ],
  "riskWarning": "风险提示语，30字以内",
  "updateTime": "数据更新时间"
}

只返回JSON，不要其他内容。`;
}

async function callDeepSeek(prompt) {
  const opts = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: '你是一位专业的A股分析师。你只返回JSON格式数据，不返回其他内容。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 4096
    })
  };
  if (proxyAgent) opts.agent = proxyAgent;

  const res = await fetch(DEEPSEEK_URL, opts);

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DeepSeek API 错误 ${res.status}: ${err}`);
  }

  const json = await res.json();
  return json.choices[0].message.content;
}

function extractJSON(text) {
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/);
  const jsonStr = jsonMatch ? jsonMatch[1] : text;
  return JSON.parse(jsonStr.trim());
}

// ============ 主流程 ============

async function main() {
  console.log('=== 每日A股推荐更新开始 ===');
  console.log(new Date().toISOString());
  console.log('');

  try {
    await initProxy();

    console.log('📊 获取市场数据 (Sina Finance)...');
    const [topMovers, lowPE, hotSectors, dragonTiger, news] = await Promise.all([
      fetchTopMovers(),
      fetchLowPEStocks(),
      fetchHotSectors(),
      fetchDragonTiger(),
      fetchMarketNews()
    ]);

    console.log(`  ✅ 涨幅榜: ${topMovers.length} 条`);
    console.log(`  ✅ 低估值: ${lowPE.length} 条`);
    console.log(`  ✅ 热门板块: ${hotSectors.length} 条`);
    console.log(`  ✅ 成交额排行: ${dragonTiger.length} 条`);
    console.log(`  ✅ 市场新闻: ${news.length} 条`);

    // 计算因子得分
    const factorResults = computeAllFactors(topMovers);

    // 调用DeepSeek分析
    console.log('');
    console.log('🤖 调用DeepSeek V4进行AI分析...');
    const prompt = buildAnalysisPrompt(topMovers, lowPE, hotSectors, dragonTiger, news, factorResults);
    const aiResponse = await callDeepSeek(prompt);
    const analysis = extractJSON(aiResponse);
    console.log('  ✅ AI分析完成');

    // 添加元数据
    analysis.updateTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    analysis.dataSource = '新浪财经 + FactorEngine因子分析 + DeepSeek V4 AI';
    analysis.disclaimer = '本推荐仅供参考，不构成投资建议。股市有风险，投资需谨慎。';

    // 为推荐股票附加因子数据
    const stockFactorMap = new Map();
    for (const s of topMovers) {
      const code = s.f12;
      const factors = factorResults?.get(code);
      if (factors) stockFactorMap.set(code, factors);
    }
    for (const cat of analysis.categories) {
      for (const stock of cat.stocks) {
        const factors = stockFactorMap.get(stock.code);
        if (factors) stock.factors = factors;
      }
    }

    // 附加因子摘要元数据
    analysis.factorSummary = {
      totalStocksScored: factorResults.size,
      topComposite: [...factorResults.entries()]
        .filter(([_, f]) => f.composite != null)
        .sort((a, b) => b[1].composite - a[1].composite)
        .slice(0, 3)
        .map(([code, f]) => ({ code, composite: f.composite })),
      weights: { valuation: 0.25, momentum: 0.20, volatility: 0.15, volume: 0.20, capital: 0.20 },
    };

    // 写入文件
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(analysis, null, 2), 'utf-8');
    console.log('');
    console.log(`✅ 推荐数据已写入: ${OUTPUT_FILE}`);

    // 打印摘要
    console.log('');
    console.log('=== 今日推荐摘要 ===');
    console.log(`市场概述: ${analysis.marketSummary}`);
    for (const cat of analysis.categories) {
      console.log(`\n${cat.icon} ${cat.name}:`);
      for (const stock of cat.stocks) {
        console.log(`  ${stock.code} ${stock.name} ¥${stock.price} (${stock.change > 0 ? '+' : ''}${stock.change}%) - ${stock.reason}`);
      }
    }
    console.log(`\n⚠️ ${analysis.riskWarning}`);
    console.log(`\n更新时间: ${analysis.updateTime}`);
  } catch (error) {
    console.error('❌ 更新失败:', error.message);
    console.error(error.stack);

    const fallback = {
      marketSummary: '数据更新中，请稍后查看...',
      categories: [],
      riskWarning: '数据获取异常，请稍后刷新',
      updateTime: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
      error: error.message
    };
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(fallback, null, 2), 'utf-8');
    process.exit(1);
  }
}

main();
