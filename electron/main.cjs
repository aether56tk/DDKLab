const { app, BrowserWindow, session, ipcMain, safeStorage } = require('electron');
const path=require('path'); const fs=require('fs');

const dataDir=()=>path.join(app.getPath('userData'),'ddklab-data');
const sessionsDir=()=>path.join(dataDir(),'sessions');
const audioDir=()=>path.join(dataDir(),'audio');
const pinFile=()=>path.join(dataDir(),'pin.bin');

const MAX_SESSION_BYTES=2*1024*1024;
const MAX_AUDIO_BYTES=50*1024*1024;

function ensureData(){
  fs.mkdirSync(sessionsDir(),{recursive:true});
  fs.mkdirSync(audioDir(),{recursive:true});
}
function validatePin(pin){return typeof pin==='string'&&/^\d{4,8}$/.test(pin);}
function safeId(value,fallback){
  const id=String(value??fallback??'DDK').replace(/[^a-zA-Z0-9_-]/g,'_');
  return id.slice(0,160)||String(fallback??'DDK');
}
function isTrustedSender(event){
  try{
    const url=event?.senderFrame?.url||'';
    if(!url.startsWith('file://')) return false;
    const pathname=decodeURIComponent(new URL(url).pathname).replace(/\\/g,'/');
    const appRoot=path.resolve(app.getAppPath()).replace(/\\/g,'/');
    const root=appRoot.startsWith('/')?appRoot:'/'+appRoot;
    return pathname.startsWith(root+'/src/ddk/');
  }catch{return false;}
}
function requireTrustedSender(event){
  if(!isTrustedSender(event)) throw new Error('Untrusted renderer');
}
function isPlainObject(value){return value!==null&&typeof value==='object'&&!Array.isArray(value);}

ipcMain.handle('security:getPinState',(event)=>{
  requireTrustedSender(event); ensureData(); return fs.existsSync(pinFile());
});
ipcMain.handle('security:setPin',(event,pin)=>{
  requireTrustedSender(event);
  if(!validatePin(pin))throw new Error('PIN must contain 4–8 digits');
  if(!safeStorage.isEncryptionAvailable())throw new Error('OS secure storage is unavailable');
  ensureData(); fs.writeFileSync(pinFile(),safeStorage.encryptString(pin),{mode:0o600}); return true;
});
ipcMain.handle('security:verifyPin',(event,pin)=>{
  requireTrustedSender(event);
  try{
    if(!validatePin(pin)||!fs.existsSync(pinFile())||!safeStorage.isEncryptionAvailable())return false;
    return safeStorage.decryptString(fs.readFileSync(pinFile()))===pin;
  }catch{return false;}
});
ipcMain.handle('storage:saveSession',(event,data)=>{
  requireTrustedSender(event);
  if(!isPlainObject(data))throw new Error('Invalid session payload');
  const json=JSON.stringify(data);
  if(Buffer.byteLength(json,'utf8')>MAX_SESSION_BYTES)throw new Error('Session payload too large');
  ensureData();
  const id=safeId(data.id,'DDK-'+Date.now());
  fs.writeFileSync(path.join(sessionsDir(),id+'.json'),json,{mode:0o600});
  return id;
});
ipcMain.handle('storage:saveAudio',(event,audio)=>{
  requireTrustedSender(event);
  if(!isPlainObject(audio))throw new Error('Invalid audio payload');
  const id=safeId(audio.id);
  const raw=audio.data;
  const buffer=Buffer.isBuffer(raw)?raw:Buffer.from(raw?.buffer||raw||[]);
  if(!buffer.length||buffer.length>MAX_AUDIO_BYTES)throw new Error('Audio payload size is invalid');
  const ext=String(audio.mime||'').includes('wav')?'wav':'webm';
  ensureData(); fs.writeFileSync(path.join(audioDir(),id+'.'+ext),buffer,{mode:0o600}); return true;
});
ipcMain.handle('storage:listSessions',(event)=>{
  requireTrustedSender(event); ensureData();
  return fs.readdirSync(sessionsDir()).filter(f=>f.endsWith('.json')).map(f=>f.slice(0,-5));
});
ipcMain.handle('storage:loadSession',(event,id)=>{
  requireTrustedSender(event);
  const safe=safeId(id);
  const file=path.join(sessionsDir(),safe+'.json');
  if(!fs.existsSync(file))return null;
  const raw=fs.readFileSync(file,'utf8');
  if(Buffer.byteLength(raw,'utf8')>MAX_SESSION_BYTES)throw new Error('Stored session is too large');
  return JSON.parse(raw);
});

function createWindow(){
  const win=new BrowserWindow({
    width:1280,height:850,minWidth:980,minHeight:700,backgroundColor:'#0b1020',
    webPreferences:{
      preload:path.join(__dirname,'preload.cjs'),
      contextIsolation:true,
      nodeIntegration:false,
      sandbox:true,
      webSecurity:true,
      allowRunningInsecureContent:false
    }
  });
  win.removeMenu();
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(event)=>event.preventDefault());
  win.loadFile(path.join(__dirname,'..','src','ddk','index.html'));
}

app.enableSandbox();

app.whenReady().then(()=>{
  session.defaultSession.setPermissionRequestHandler((webContents,permission,callback)=>{
    const url=webContents?.getURL?.()||'';
    callback(permission==='media'&&url.startsWith('file://'));
  });
  createWindow();
  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
