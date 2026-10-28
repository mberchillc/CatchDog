@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Instala Node.js 24 o posterior y volve a abrir este archivo.
 pause
 exit /b 1
)
node -e "if(Number(process.versions.node.split('.')[0])<24)process.exit(1)"
if errorlevel 1 (
 echo Se necesita Node.js 24 o posterior.
 pause
 exit /b 1
)
if not exist node_modules (
 call npm install --package-lock=false
 if errorlevel 1 exit /b 1
)
echo Iniciando Turi. Abri la direccion que aparezca debajo.
call npm start
pause
