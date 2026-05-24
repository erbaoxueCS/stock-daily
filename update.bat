@echo off
chcp 65001 >nul
cd /d "%~dp0"

set LOGFILE=%~dp0update.log
set http_proxy=http://127.0.0.1:7890
set https_proxy=http://127.0.0.1:7890

echo [%date% %time%] ===== 每日A股推荐更新开始 ===== >> "%LOGFILE%"

echo [1/3] 获取市场数据 + AI分析...
node scripts/daily-update.js >> "%LOGFILE%" 2>&1
if %errorlevel% neq 0 (
    echo [%date% %time%] 数据更新失败 >> "%LOGFILE%"
    exit /b 1
)

echo [2/3] 提交更新到GitHub...
git add data/recommendations.json >> "%LOGFILE%" 2>&1
git commit -m "Daily stock update %date%" >> "%LOGFILE%" 2>&1
git push origin master >> "%LOGFILE%" 2>&1
if %errorlevel% neq 0 (
    echo [%date% %time%] Git推送失败 >> "%LOGFILE%"
)

echo [3/3] 部署到Netlify...
call netlify deploy --prod --dir=. >> "%LOGFILE%" 2>&1

echo [%date% %time%] ===== 更新完成 ===== >> "%LOGFILE%"
echo. >> "%LOGFILE%"
