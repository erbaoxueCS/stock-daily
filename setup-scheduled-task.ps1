# 每日A股推荐 - Windows计划任务安装脚本
# 每天下午4点(交易日)自动运行更新

$taskName = "每日A股推荐更新"
$scriptPath = "$PSScriptRoot\update.bat"
$taskDescription = "每个交易日下午4点自动获取A股数据、AI分析、推送到GitHub并部署到Netlify"

# 删除旧任务（如果存在）
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "删除现有任务..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

# 创建任务触发器：每周一到周五 16:00
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At 16:00

# 创建任务操作
$action = New-ScheduledTaskAction -Execute $scriptPath -WorkingDirectory $PSScriptRoot

# 任务配置：不要求电池供电、允许唤醒、出错重试
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -RestartInterval (New-TimeSpan -Minutes 5) `
    -RestartCount 3 `
    -Compatibility Win8

# 以当前用户身份运行
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest

# 注册任务
Register-ScheduledTask -TaskName $taskName `
    -Description $taskDescription `
    -Trigger $trigger `
    -Action $action `
    -Settings $settings `
    -Principal $principal `
    -Force

Write-Host ""
Write-Host "✅ 定时任务已创建成功！" -ForegroundColor Green
Write-Host "   任务名称: $taskName"
Write-Host "   执行时间: 每个工作日 16:00"
Write-Host "   执行脚本: $scriptPath"
Write-Host "   日志文件: $PSScriptRoot\update.log"
Write-Host ""
Write-Host "📋 管理命令:" -ForegroundColor Cyan
Write-Host "   查看任务: Get-ScheduledTask -TaskName '$taskName'"
Write-Host "   手动运行: Start-ScheduledTask -TaskName '$taskName'"
Write-Host "   查看日志: Get-Content '$PSScriptRoot\update.log' -Tail 20"
Write-Host "   删除任务: Unregister-ScheduledTask -TaskName '$taskName'"
Write-Host ""
Write-Host "🔧 修改执行时间:" -ForegroundColor Cyan
Write-Host "   编辑任务计划程序 → 找到 '$taskName' → 触发器 → 编辑"
Write-Host ""
