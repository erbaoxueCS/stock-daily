import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'recommendations.json');

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'sk-2da67e882762416b958967d06ce1e500';
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

// 东方财富 API 基础 URL
const EM_BASE = 'https://push2.eastmoney.com/api/qt/clist/get';

// ============ 数据获取函数 ============

async function fetchFromEastMoney(params) {
  const url = `${EM_BASE}?${new URLSearchParams(params)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://quote.eastmoney.com/' }
  });
  const json = await res.json();
  return json?.data?.diff || [];
}

// 1. 获取全A股行情 (按涨幅排序 Top200)
async function fetchTopMovers() {
  return fetchFromEastMoney({
    pn: '1', pz: '200', po: '1', np: '1',
    ut: 'bd1d9ddb04089700cf9c27f6f7426281',
    fltt: '2', invt: '2',
    fid: 'f3',
    'fs': 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23',
    fields: 'f2,f3,f4,f8,f9,f10,f12,f14,f15,f16,f17,f18,f20,f21,f23,f62,f115,f128,f140,f141'
  });
}

// 2. 获取低估值股票 (按PE排序)
async function fetchLowPEStocks() {
  return fetchFromEastMoney({
    pn: '1', pz: '200', po: '1', np: '1',
    ut: 'bd1d9ddb04089700cf9c27f6f7426281',
    fltt: '2', invt: '2',
    fid: 'f9',
    'fs': 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23',
    fields: 'f2,f3,f4,f8,f9,f10,f12,f14,f20,f21,f23,f62,f115'
  });
}

// 3. 获取热门概念板块
async function fetchHotSectors() {
  return fetchFromEastMoney({
    pn: '1', pz: '50', po: '1', np: '1',
    ut: 'bd1d9ddb04089700cf9c27f6f7426281',
    fltt: '2', invt: '2',
    fid: 'f3',
    'fs': 'm:90+t:3',
    fields: 'f2,f3,f4,f12,f14,f104,f105,f128,f140'
  });
}

// 4. 获取龙虎榜数据
async function fetchDragonTiger() {
  return fetchFromEastMoney({
    pn: '1', pz: '50', po: '1', np: '1',
    ut: 'bd1d9ddb04089700cf9c27f6f7426281',
    fltt: '2', invt: '2',
    fid: 'f3',
    'fs': 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23',
    fields: 'f2,f3,f8,f9,f10,f12,f14,f62,f184,f66,f69,f72,f75,f78,f81'
  });
}

// 5. 获取市场新闻
async function fetchMarketNews() {
  try {
    const url = 'https://np-listapi.eastmoney.com/comm/web/getNewsByColumnId?columnId=102&pageNum=1&pageSize=20';
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://finance.eastmoney.com/' }
    });
    const json = await res.json();
    return (json?.data?.list || []).slice(0, 15).map(n => ({
      title: n.title || n.title_show || '',
      summary: n.digest || '',
      time: n.show_time || ''
    }));
  } catch (e) {
    console.error('获取新闻失败:', e.message);
    return [];
  }
}

// 6. 获取板块内领涨股
async function fetchSectorLeaders(sectorCode) {
  const stocks = await fetchFromEastMoney({
    pn: '1', pz: '10', po: '1', np: '1',
    ut: 'bd1d9ddb04089700cf9c27f6f7426281',
    fltt: '2', invt: '2',
    fid: 'f3',
    'fs': `b:${sectorCode}`,
    fields: 'f2,f3,f4,f12,f14,f20'
  });
  return stocks;
}

// ============ AI 分析 ============

function buildAnalysisPrompt(topMovers, lowPE, hotSectors, dragonTiger, news) {
  // 压缩数据 - 只取关键字段
  const topMoversSample = topMovers.slice(0, 100).map(s => ({
    代码: s.f12, 名称: s.f14, 最新价: s.f2, 涨跌幅: s.f3 + '%',
    PE: s.f9, PB: s.f23, 总市值: (s.f20 / 1e8).toFixed(1) + '亿',
    换手率: s.f8 + '%', 量比: s.f10
  }));

  const lowPESample = lowPE.filter(s => parseFloat(s.f9) > 0 && parseFloat(s.f9) < 20 && parseFloat(s.f20) > 10e8)
    .slice(0, 50).map(s => ({
      代码: s.f12, 名称: s.f14, PE: s.f9, PB: s.f23, 涨跌幅: s.f3 + '%',
      总市值: (s.f20 / 1e8).toFixed(1) + '亿'
    }));

  const hotSectorSample = hotSectors.slice(0, 20).map(s => ({
    代码: s.f12, 名称: s.f14, 涨跌幅: s.f3 + '%', 上涨家数: s.f104, 下跌家数: s.f105
  }));

  const newsTitles = news.slice(0, 10).map(n => n.title);

  return `你是一位经验丰富的A股分析师。请根据以下市场数据，推荐今日有潜力的股票。

## 今日涨幅领先股票 (Top 100)
${JSON.stringify(topMoversSample, null, 2)}

## 低估值股票 (PE<20, 市值>10亿)
${JSON.stringify(lowPESample, null, 2)}

## 热门概念板块 (Top 20)
${JSON.stringify(hotSectorSample, null, 2)}

## 今日市场新闻
${newsTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')}

## 任务要求
请严格按以下JSON格式返回推荐。推荐4个类别，每类3-5只股票：

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
          "reason": "推荐理由，说明为什么选这只股票，引用具体数据"
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
  const res = await fetch(DEEPSEEK_URL, {
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
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DeepSeek API 错误 ${res.status}: ${err}`);
  }

  const json = await res.json();
  return json.choices[0].message.content;
}

function extractJSON(text) {
  // 处理可能的 markdown 代码块包裹
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
    // 并行获取数据
    console.log('📊 获取市场数据...');
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
    console.log(`  ✅ 龙虎榜: ${dragonTiger.length} 条`);
    console.log(`  ✅ 市场新闻: ${news.length} 条`);

    // 调用DeepSeek分析
    console.log('');
    console.log('🤖 调用DeepSeek V4进行AI分析...');
    const prompt = buildAnalysisPrompt(topMovers, lowPE, hotSectors, dragonTiger, news);
    const aiResponse = await callDeepSeek(prompt);
    const analysis = extractJSON(aiResponse);
    console.log('  ✅ AI分析完成');

    // 添加元数据
    analysis.updateTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    analysis.dataSource = '东方财富实时行情 + DeepSeek V4 AI分析';
    analysis.disclaimer = '本推荐仅供参考，不构成投资建议。股市有风险，投资需谨慎。';

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

    // 写入错误信息作为回退
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
