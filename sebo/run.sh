Echo “Iniciando el servidor Node.js…”

# Verificar si nodemon está instalado globalmente o localmente
If command -v nodemon &> /dev/null
Then
    Npm run dev
Else
    Echo “Nodemon no encontrado. Intentando iniciar con ‘node’. Para desarrollo, considera instalar nodemon: npm install -g nodemon”
    Npm start
Fi

Echo “Para detener el servidor, presiona Ctrl+C.”
