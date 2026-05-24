export default async function handler(req) {
  console.log('定时更新触发:', new Date().toISOString());

  try {
    const buildHookUrl = process.env.NETLIFY_BUILD_HOOK;
    if (buildHookUrl) {
      await fetch(buildHookUrl, { method: 'POST' });
      console.log('Build hook 已触发');
    }

    return new Response(JSON.stringify({
      message: '每日更新已触发',
      time: new Date().toISOString()
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('更新触发失败:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
