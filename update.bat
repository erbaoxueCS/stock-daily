@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo   每日A股推荐数据更新
echo ========================================
echo.

set http_proxy=http://127.0.0.1:7890
set https_proxy=http://127.0.0.1:7890

echo [1/3] 获取市场数据 + AI分析...
node scripts/daily-update.js
if %errorlevel% neq 0 (
    echo ❌ 数据更新失败，请检查网络连接
    pause
    exit /b 1
)

echo.
echo [2/3] 提交更新到GitHub...
git add data/recommendations.json
git commit -m "📊 每日股票推荐更新 %date%"
git push origin master
if %errorlevel% neq 0 (
    echo ⚠️ 推送到GitHub失败，数据已本地更新
    pause
    exit /b 1
)

echo.
echo [3/3] 部署到Netlify...
call netlify deploy --prod --dir=.

echo.
echo ========================================
echo   ✅ 更新完成！
echo   查看页面: https://stock-daily-recommend.netlify.app
echo ========================================
pause
