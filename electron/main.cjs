const { app, BrowserWindow, session, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const dataDir = () => path.join(app.getPath('userData'), 'ddklab-data');
const sessionsDir = () => path.join(dataDir(), 'sessions');
function ensureData(){ fs.mkdirSync(sessionsDir(), {recursive:true}); }

ipcMain.handle('storage:saveSession', (_e, data) => {
  ensureData();
  const id = String(data.id || `DDK-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g,'_');
  fs.writeFileSync(path.join(sessionsDir(), `${id}.json`), JSON.stringify(data), {mode:0o600});
  return id;
});
ipcMain.handle('storage:listSessions', () => {
  ensureData();
  return fs.readdirSync(sessionsDir()).filter(f=>f.endsWith('.json')).map(f=>f.slice(0,-5));
});
ipcMain.handle('storage:loadSession', (_e,id) => {
  const safe=String(id).replace(/[^a-zA-Z0-9_-]/g,'_');
  const file=path.join(sessionsDir(),`${safe}.json`);
  if(!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file,'utf8'));
});

function createWindow(){
  const win=new BrowserWindow({width:1280,height:850,minWidth:980,minHeight:700,backgroundColor:'#0b1020',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.removeMenu();
  win.loadFile(path.join(__dirname,'..','src','ddk','index.html'));
}
app.whenReady().then(()=>{
  session.defaultSession.setPermissionRequestHandler((_wc,permission,callback)=>callback(permission==='media'));
  createWindow();
  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
