<?php
$secureSession = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
session_set_cookie_params([
    'httponly' => true,
    'secure' => $secureSession,
    'samesite' => 'Lax',
]);
session_start();
header("Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
$csrfToken = $_SESSION['csrf_token'] ??= bin2hex(random_bytes(32));
$dbDir = __DIR__ . '/data'; if (!is_dir($dbDir)) mkdir($dbDir, 0775, true);
$db = new PDO('sqlite:' . $dbDir . '/projects.sqlite'); $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION); $db->exec('PRAGMA foreign_keys=ON');
$db->exec("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT DEFAULT '', status TEXT DEFAULT 'active', provider TEXT DEFAULT 'GitHub', repo_url TEXT DEFAULT '', last_commit TEXT DEFAULT '', commit_date TEXT DEFAULT '', default_branch TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP, user_id INTEGER);
CREATE TABLE IF NOT EXISTS computers (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL, UNIQUE(user_id,name), FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS locations (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, computer_id INTEGER, computer TEXT DEFAULT '', folder TEXT NOT NULL, FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE, FOREIGN KEY(computer_id) REFERENCES computers(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS project_links (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, label TEXT NOT NULL DEFAULT '', url TEXT NOT NULL, favicon_url TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, title TEXT NOT NULL, done INTEGER DEFAULT 0, due_date TEXT DEFAULT '', priority TEXT NOT NULL DEFAULT 'medium', FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS project_members (project_id INTEGER NOT NULL, user_id INTEGER NOT NULL, role TEXT NOT NULL DEFAULT 'viewer', created_at TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(project_id,user_id), FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, project_id INTEGER, message TEXT NOT NULL, read_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS schema_versions (version INTEGER PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP);");
$db->exec("INSERT OR IGNORE INTO schema_versions(version) VALUES(1)");
$db->exec("CREATE TABLE IF NOT EXISTS login_attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, ip TEXT NOT NULL, email TEXT NOT NULL, attempted_at TEXT DEFAULT CURRENT_TIMESTAMP)");
// Keep a small rolling set of SQLite snapshots. Backups are best-effort and never block startup.
$backupDir=$dbDir.'/backups';if(!is_dir($backupDir))@mkdir($backupDir,0775,true);$today=$backupDir.'/projects-'.date('Y-m-d').'.sqlite';if(!is_file($today)&&is_dir($backupDir)){try{$db->exec('VACUUM INTO '. $db->quote($today));}catch(Throwable $e){}}$backups=glob($backupDir.'/projects-*.sqlite')?:[];rsort($backups);foreach(array_slice($backups,14) as $old)@unlink($old);
$gitRoots=array_values(array_filter(array_map('realpath',array_map('trim',explode(',',(string)getenv('PROJECT_GIT_ROOTS'))))));
$gitServiceUrl=rtrim(trim((string)getenv('GIT_SERVICE_URL')),'/');
$gitServiceToken=trim((string)getenv('GIT_SERVICE_TOKEN'));
function validGitPath($path){global $gitRoots;$real=realpath(trim((string)$path));if(!$real||!is_dir($real.'/.git')||!$gitRoots)return null;foreach($gitRoots as $root){if($real===$root||str_starts_with($real,$root.DIRECTORY_SEPARATOR))return $real;}return null;}
function gitServiceRequest($endpoint,$path){
    global $gitServiceUrl,$gitServiceToken;
    if(!$gitServiceUrl)throw new RuntimeException('Servizio Git locale non configurato');
    if(!$gitServiceToken)throw new RuntimeException('Token del servizio Git locale non configurato');
    $ch=curl_init($gitServiceUrl.'/'.ltrim($endpoint,'/'));
    $body=json_encode(['path'=>(string)$path],JSON_THROW_ON_ERROR);
    curl_setopt_array($ch,[CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>$body,CURLOPT_RETURNTRANSFER=>true,CURLOPT_CONNECTTIMEOUT=>2,CURLOPT_TIMEOUT=>10,CURLOPT_HTTPHEADER=>['Accept: application/json','Content-Type: application/json','Authorization: Bearer '.$gitServiceToken]]);
    $response=curl_exec($ch);$status=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE);$error=curl_error($ch);curl_close($ch);
    if($response===false||$status<200||$status>=300)throw new RuntimeException($error?:'Servizio Git locale HTTP '.$status);
    $data=json_decode((string)$response,true);if(!is_array($data))throw new RuntimeException('Risposta del servizio Git non valida');
    if(!empty($data['error']))throw new RuntimeException((string)$data['error']);
    return $data;
}
function githubRepo($url){
    $parsed=parse_url(trim((string)$url));
    if(strtolower((string)($parsed['host']??''))!=='github.com')return null;
    $parts=array_values(array_filter(explode('/',trim((string)($parsed['path']??''),'/')),fn($part)=>$part!==''));
    if(count($parts)!==2)return null;
    $repo=preg_replace('/\.git$/i','',$parts[1]);
    if(!preg_match('/^[A-Za-z0-9_.-]+$/',$parts[0])||!preg_match('/^[A-Za-z0-9_.-]+$/',$repo))return null;
    return ['owner'=>$parts[0],'repo'=>$repo,'url'=>'https://github.com/'.$parts[0].'/'.$repo];
}
function githubRequest($url){
    $ch=curl_init($url);$headers=['Accept: application/vnd.github+json','User-Agent: Project-Hub'];
    $token=trim((string)getenv('GITHUB_TOKEN'));if($token)$headers[]='Authorization: Bearer '.$token;
    curl_setopt_array($ch,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_CONNECTTIMEOUT=>4,CURLOPT_TIMEOUT=>8,CURLOPT_HTTPHEADER=>$headers]);
    $body=curl_exec($ch);$status=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE);$error=curl_error($ch);curl_close($ch);
    if($body===false||$status<200||$status>=300)throw new RuntimeException($error?:'GitHub ha restituito HTTP '.$status);
    $data=json_decode((string)$body,true);if(!is_array($data))throw new RuntimeException('Risposta GitHub non valida');return $data;
}
function githubInfo($url){
    $repo=githubRepo($url);if(!$repo)throw new RuntimeException('Inserisci un URL repository GitHub valido');
    $base='https://api.github.com/repos/'.rawurlencode($repo['owner']).'/'.rawurlencode($repo['repo']);$metadata=githubRequest($base);$branch=$metadata['default_branch']??'main';
    $commits=githubRequest($base.'/commits?sha='.rawurlencode($branch).'&per_page=1');$commit=$commits[0]??[];$commitData=$commit['commit']??[];$author=$commitData['author']??[];
    return ['repo_url'=>$repo['url'],'name'=>$metadata['name']??$repo['repo'],'description'=>$metadata['description']??'','last_commit'=>trim(explode("\n",(string)($commitData['message']??''))[0]),'commit_date'=>$author['date']??($metadata['pushed_at']??''),'branch'=>$branch,'private'=>!empty($metadata['private'])];
}
function projectLink($rawUrl){
    $url=trim((string)$rawUrl);$parts=parse_url($url);
    if(strlen($url)>2048||!filter_var($url,FILTER_VALIDATE_URL)||!in_array(strtolower((string)($parts['scheme']??'')),['http','https'],true)||empty($parts['host'])||isset($parts['user'])||isset($parts['pass']))return null;
    $scheme=strtolower((string)$parts['scheme']);$host=(string)$parts['host'];$port=isset($parts['port'])?':'.(int)$parts['port']:'';$origin=$scheme.'://'.$host.$port;
    return ['url'=>$url,'favicon_url'=>$origin.'/favicon.ico','host'=>$host];
}
// Migrate older databases that predate multi-user support.
$cols=$db->query("PRAGMA table_info(projects)")->fetchAll(PDO::FETCH_ASSOC);$names=array_column($cols,'name');if(!in_array('user_id',$names))$db->exec('ALTER TABLE projects ADD COLUMN user_id INTEGER');if(!in_array('default_branch',$names))$db->exec("ALTER TABLE projects ADD COLUMN default_branch TEXT DEFAULT ''");
$locationCols=$db->query("PRAGMA table_info(locations)")->fetchAll(PDO::FETCH_ASSOC);$locationNames=array_column($locationCols,'name');if(!in_array('computer_id',$locationNames))$db->exec('ALTER TABLE locations ADD COLUMN computer_id INTEGER');
$taskCols=$db->query("PRAGMA table_info(tasks)")->fetchAll(PDO::FETCH_ASSOC);$taskNames=array_column($taskCols,'name');if(!in_array('due_date',$taskNames))$db->exec("ALTER TABLE tasks ADD COLUMN due_date TEXT DEFAULT ''");if(!in_array('priority',$taskNames))$db->exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium'");
// Migrate the original single-user database and provide a local account.
$hasUser=(int)$db->query('SELECT COUNT(*) FROM users')->fetchColumn();
if(!$hasUser){$bootstrapPassword=bin2hex(random_bytes(12));$s=$db->prepare('INSERT INTO users(name,email,password) VALUES(?,?,?)');$s->execute(['Samuele','samuele@localhost',password_hash($bootstrapPassword,PASSWORD_DEFAULT)]);$uid=(int)$db->lastInsertId();$db->prepare('UPDATE projects SET user_id=? WHERE user_id IS NULL')->execute([$uid]);error_log('Project Hub: account iniziale creato — email samuele@localhost, password temporanea: '.$bootstrapPassword.' (cambiarla dopo il primo accesso)');}
$uid=(int)$db->query('SELECT id FROM users ORDER BY id LIMIT 1')->fetchColumn();
// Optional Authentik/OIDC login. It is enabled only when all environment variables exist.
$oidcIssuer=rtrim((string)getenv('AUTHENTIK_ISSUER'),'/');$oidcClient=(string)getenv('AUTHENTIK_CLIENT_ID');$oidcSecret=(string)getenv('AUTHENTIK_CLIENT_SECRET');$oidcRedirect=(string)(getenv('AUTHENTIK_REDIRECT_URI')?:((isset($_SERVER['HTTPS'])?'https':'http').'://'.($_SERVER['HTTP_HOST']??'localhost').'/index.php?oidc_callback=1'));
if(isset($_GET['oidc'])&&$oidcIssuer&&$oidcClient&&$oidcSecret){$dis=json_decode((string)@file_get_contents($oidcIssuer.'/.well-known/openid-configuration'),true);if(!empty($dis['authorization_endpoint'])){$_SESSION['oidc_state']=bin2hex(random_bytes(16));header('Location: '.$dis['authorization_endpoint'].'?'.http_build_query(['client_id'=>$oidcClient,'redirect_uri'=>$oidcRedirect,'response_type'=>'code','scope'=>'openid profile email','state'=>$_SESSION['oidc_state']]));exit;}}
if(isset($_GET['oidc_callback'])&&$oidcIssuer&&$oidcClient&&$oidcSecret&&hash_equals($_SESSION['oidc_state']??'',$_GET['state']??'')){ $dis=json_decode((string)@file_get_contents($oidcIssuer.'/.well-known/openid-configuration'),true);$ch=curl_init($dis['token_endpoint']??'');curl_setopt_array($ch,[CURLOPT_POST=>1,CURLOPT_RETURNTRANSFER=>1,CURLOPT_POSTFIELDS=>http_build_query(['grant_type'=>'authorization_code','code'=>$_GET['code']??'','redirect_uri'=>$oidcRedirect,'client_id'=>$oidcClient,'client_secret'=>$oidcSecret])]);$tok=json_decode((string)curl_exec($ch),true);curl_close($ch);$ch=curl_init($dis['userinfo_endpoint']??'');curl_setopt_array($ch,[CURLOPT_RETURNTRANSFER=>1,CURLOPT_HTTPHEADER=>['Authorization: Bearer '.($tok['access_token']??'')]]);$info=json_decode((string)curl_exec($ch),true);curl_close($ch);if(!empty($info['email'])){$s=$db->prepare('SELECT id FROM users WHERE email=?');$s->execute([strtolower($info['email'])]);$id=$s->fetchColumn();if(!$id){$s=$db->prepare('INSERT INTO users(name,email,password) VALUES(?,?,?)');$s->execute([$info['name']??$info['preferred_username']??$info['email'],strtolower($info['email']),password_hash(bin2hex(random_bytes(24)),PASSWORD_DEFAULT)]);$id=$db->lastInsertId();}session_regenerate_id(true);$_SESSION['user_id']=$id;$_SESSION['csrf_token']=bin2hex(random_bytes(32));$csrfToken=$_SESSION['csrf_token'];unset($_SESSION['oidc_state']);header('Location: index.php');exit;}}
// Migrate old free-form computer names into the normalized computer table.
$oldLocations=$db->query("SELECT DISTINCT computer FROM locations WHERE computer_id IS NULL AND TRIM(computer)<>''")->fetchAll(PDO::FETCH_COLUMN);
foreach($oldLocations as $computer){$s=$db->prepare('INSERT OR IGNORE INTO computers(user_id,name) VALUES(?,?)');$s->execute([$uid,$computer]);$s=$db->prepare('UPDATE locations SET computer_id=(SELECT id FROM computers WHERE user_id=? AND name=?) WHERE computer=? AND computer_id IS NULL');$s->execute([$uid,$computer,$computer]);}
if((int)$db->query('SELECT COUNT(*) FROM projects')->fetchColumn()===0){$q=$db->prepare('INSERT INTO projects(name,description,status,provider,repo_url,last_commit,commit_date,user_id) VALUES(?,?,?,?,?,?,?,?)');$q->execute(['Atlas Dashboard','Monitoraggio e analisi dei tuoi progetti.','active','GitHub','https://github.com/samuele/atlas-dashboard','feat: add project overview','2024-06-14',$uid]);$q->execute(['Casa nuova','Checklist e appunti per il prossimo trasloco.','active','Gitea','https://gitea.local/samuele/casa-nuova','fix: mobile layout','2024-06-12',$uid]);$q->execute(['API Playground','Esperimenti con API e integrazioni.','paused','GitHub','https://github.com/samuele/api-playground','chore: update dependencies','2024-05-28',$uid]);} function json($x,$status=200){http_response_code($status);header('Content-Type: application/json'); echo json_encode($x); exit;}
function body(){return json_decode(file_get_contents('php://input'),true) ?: $_POST;}
function requireCsrf(){global $csrfToken;$received=$_SERVER['HTTP_X_CSRF_TOKEN']??'';if(!$received||!hash_equals($csrfToken,$received))json(['error'=>'Token di sicurezza non valido','csrf'=>true]);}
function user(){global $db; if(empty($_SESSION['user_id'])) return null; $s=$db->prepare('SELECT id,name,email FROM users WHERE id=?');$s->execute([$_SESSION['user_id']]);return $s->fetch(PDO::FETCH_ASSOC) ?: null;}
function auth(){ $u=user(); if(!$u) json(['error'=>'Autenticazione richiesta','auth'=>false]); return $u; }
if(isset($_GET['api'])){$a=$_GET['api'];$in=body();
 if($a==='oidc-config'){json(['enabled'=>(bool)($oidcIssuer&&$oidcClient&&$oidcSecret)]);}
 if($a==='backup-status'){auth();json(['enabled'=>is_dir($backupDir),'latest'=>basename((string)(glob($backupDir.'/projects-*.sqlite')[0]??''))]);}
 if($a==='session'){json(['user'=>user(),'csrf'=>$csrfToken]);}
 if($a==='login'){ requireCsrf();$loginEmail=strtolower(trim($in['email']??''));$loginIp=(string)($_SERVER['REMOTE_ADDR']??'');$db->exec("DELETE FROM login_attempts WHERE attempted_at < datetime('now','-1 day')");$st=$db->prepare("SELECT COUNT(*) FROM login_attempts WHERE ip=? AND email=? AND attempted_at > datetime('now','-15 minutes')");$st->execute([$loginIp,$loginEmail]);if((int)$st->fetchColumn()>=8)json(['error'=>'Troppi tentativi di accesso. Riprova tra qualche minuto.'],429);$s=$db->prepare('SELECT * FROM users WHERE email=?');$s->execute([$loginEmail]);$u=$s->fetch(PDO::FETCH_ASSOC);if(!$u||!password_verify($in['password']??'',$u['password'])){$db->prepare('INSERT INTO login_attempts(ip,email) VALUES(?,?)')->execute([$loginIp,$loginEmail]);json(['error'=>'Email o password non validi']);}$db->prepare('DELETE FROM login_attempts WHERE ip=? AND email=?')->execute([$loginIp,$loginEmail]);session_regenerate_id(true);$_SESSION['user_id']=$u['id'];$_SESSION['csrf_token']=bin2hex(random_bytes(32));$csrfToken=$_SESSION['csrf_token'];json(['ok'=>1,'user'=>user(),'csrf'=>$csrfToken]); }
 if($a==='register'){ requireCsrf();$name=trim($in['name']??'');$email=strtolower(trim($in['email']??''));$pass=$in['password']??'';if(!$name||!filter_var($email,FILTER_VALIDATE_EMAIL)||strlen($pass)<8)json(['error'=>'Inserisci nome, email valida e password di almeno 8 caratteri']);try{$s=$db->prepare('INSERT INTO users(name,email,password) VALUES(?,?,?)');$s->execute([$name,$email,password_hash($pass,PASSWORD_DEFAULT)]);session_regenerate_id(true);$_SESSION['user_id']=$db->lastInsertId();$_SESSION['csrf_token']=bin2hex(random_bytes(32));$csrfToken=$_SESSION['csrf_token'];json(['ok'=>1,'user'=>user(),'csrf'=>$csrfToken]);}catch(Exception $e){json(['error'=>'Questa email è già registrata']);}}
 if($a==='logout'){if($_SERVER['REQUEST_METHOD']!=='POST')json(['error'=>'Metodo non consentito'],405);requireCsrf();session_destroy();json(['ok'=>1]);} $u=auth(); $uid=(int)$u['id'];
 $readOnlyApis=['oidc-config','backup-status','session','list','computers','members','notifications'];
 if(!in_array($a,$readOnlyApis,true)){if($_SERVER['REQUEST_METHOD']!=='POST')json(['error'=>'Metodo non consentito'],405);requireCsrf();}
 function projectRole($id,$uid){global $db;$s=$db->prepare('SELECT CASE WHEN user_id=? THEN "owner" ELSE (SELECT role FROM project_members WHERE project_id=projects.id AND user_id=?) END FROM projects WHERE id=?');$s->execute([$uid,$uid,(int)$id]);return $s->fetchColumn()?:null;}
 function requireProject($id,$uid,$write=false){$role=projectRole($id,$uid);if(!$role||($write&&!in_array($role,['owner','editor'],true)))json(['error'=>'Non autorizzato']);return $role;}
 function event($uid,$pid,$message){global $db;$s=$db->prepare('INSERT INTO notifications(user_id,project_id,message) SELECT user_id,?,? FROM (SELECT user_id FROM projects WHERE id=? UNION SELECT user_id FROM project_members WHERE project_id=?) WHERE user_id<>?');$s->execute([$pid,$message,$pid,$pid,$uid]);}
 if($a==='list'){$s=$db->prepare('SELECT p.*,CASE WHEN p.user_id=? THEN "owner" ELSE pm.role END member_role FROM projects p LEFT JOIN project_members pm ON pm.project_id=p.id AND pm.user_id=? WHERE p.user_id=? OR pm.user_id=? ORDER BY p.updated_at DESC,p.id DESC');$s->execute([$uid,$uid,$uid,$uid]);$ps=$s->fetchAll(PDO::FETCH_ASSOC);foreach($ps as &$p){$q=$db->prepare('SELECT l.id,l.project_id,l.folder,c.id computer_id,c.name computer FROM locations l LEFT JOIN computers c ON c.id=l.computer_id WHERE l.project_id=?');$q->execute([$p['id']]);$p['locations']=$q->fetchAll(PDO::FETCH_ASSOC);$q=$db->prepare('SELECT id,project_id,label,url,favicon_url FROM project_links WHERE project_id=? ORDER BY id');$q->execute([$p['id']]);$p['links']=$q->fetchAll(PDO::FETCH_ASSOC);$q=$db->prepare('SELECT t.* FROM tasks t WHERE t.project_id=? ORDER BY t.id');$q->execute([$p['id']]);$p['tasks']=$q->fetchAll(PDO::FETCH_ASSOC);}json($ps);}
 if($a==='computers'){$s=$db->prepare('SELECT c.*,COUNT(l.id) paths FROM computers c LEFT JOIN locations l ON l.computer_id=c.id JOIN projects p ON p.id=l.project_id WHERE c.user_id=? GROUP BY c.id UNION SELECT c.*,0 paths FROM computers c WHERE c.user_id=? AND NOT EXISTS(SELECT 1 FROM locations l WHERE l.computer_id=c.id) ORDER BY name');$s->execute([$uid,$uid]);json($s->fetchAll(PDO::FETCH_ASSOC));}
 if($a==='computer'){$name=trim($in['name']??'');if(!$name)json(['error'=>'Inserisci il nome del computer']);$s=$db->prepare('INSERT OR IGNORE INTO computers(user_id,name) VALUES(?,?)');$s->execute([$uid,$name]);json(['ok'=>1]);}
 if($a==='remove-computer'){$s=$db->prepare('DELETE FROM computers WHERE id=? AND user_id=?');$s->execute([(int)$in['id'],$uid]);json(['ok'=>1]);}
 if($a==='save'){$id=(int)($in['id']??0);$url=trim($in['repo_url']??'');$remote=null;if($url&&githubRepo($url)){try{$remote=githubInfo($url);}catch(Throwable $e){/* Keep manually entered values when GitHub is temporarily unavailable. */}}$name=trim($remote['name']??($in['name']??''));if(!$name)json(['error'=>'Inserisci un nome o un URL GitHub valido']);$fields=[$name,$remote!==null?(string)$remote['description']:trim($in['description']??''),$in['status']??'active',$remote!==null?'GitHub':($in['provider']??'GitHub'),$remote['repo_url']??$url,$remote['last_commit']??trim($in['last_commit']??''),$remote!==null?substr((string)($remote['commit_date']??''),0,10):($in['commit_date']??''),$remote['branch']??($in['default_branch']??'')];if($id){requireProject($id,$uid,true);$s=$db->prepare('UPDATE projects SET name=?,description=?,status=?,provider=?,repo_url=?,last_commit=?,commit_date=?,default_branch=?,updated_at=CURRENT_TIMESTAMP WHERE id=?');$s->execute([...$fields,$id]);}else{$s=$db->prepare('INSERT INTO projects(name,description,status,provider,repo_url,last_commit,commit_date,default_branch,user_id) VALUES(?,?,?,?,?,?,?,?,?)');$s->execute([...$fields,$uid]);$id=$db->lastInsertId();$db->prepare('INSERT OR IGNORE INTO project_members(project_id,user_id,role) VALUES(?,?,?)')->execute([$id,$uid,'owner']);}event($uid,$id,'Progetto aggiornato: '.$name);json(['ok'=>1,'id'=>$id,'remote'=>$remote]);}
 if($a==='delete'){if(projectRole((int)$in['id'],$uid)!=='owner')json(['error'=>'Solo il proprietario può eliminare']);$s=$db->prepare('DELETE FROM projects WHERE id=? AND user_id=?');$s->execute([(int)$in['id'],$uid]);json(['ok'=>1]);}
 if($a==='members'){requireProject((int)$in['project_id'],$uid);$s=$db->prepare('SELECT u.id,u.name,u.email,pm.role FROM project_members pm JOIN users u ON u.id=pm.user_id WHERE pm.project_id=?');$s->execute([(int)$in['project_id']]);json($s->fetchAll(PDO::FETCH_ASSOC));}
 if($a==='share'){if(projectRole((int)$in['project_id'],$uid)!=='owner')json(['error'=>'Solo il proprietario può condividere']);$email=strtolower(trim($in['email']??''));$role=in_array($in['role']??'viewer',['viewer','editor'],true)?$in['role']:'viewer';$s=$db->prepare('SELECT id FROM users WHERE email=?');$s->execute([$email]);$member=$s->fetchColumn();if(!$member)json(['error'=>'Utente non trovato']);$db->prepare('INSERT INTO project_members(project_id,user_id,role) VALUES(?,?,?) ON CONFLICT(project_id,user_id) DO UPDATE SET role=excluded.role')->execute([(int)$in['project_id'],$member,$role]);event($member,(int)$in['project_id'],'Sei stato aggiunto a un progetto');json(['ok'=>1]);}
 if($a==='unshare'){if(projectRole((int)$in['project_id'],$uid)!=='owner')json(['error'=>'Solo il proprietario può rimuovere membri']);$db->prepare('DELETE FROM project_members WHERE project_id=? AND user_id=?')->execute([(int)$in['project_id'],(int)$in['user_id']]);json(['ok'=>1]);}
 if($a==='notifications'){$s=$db->prepare('SELECT n.*,p.name project FROM notifications n LEFT JOIN projects p ON p.id=n.project_id WHERE n.user_id=? ORDER BY n.id DESC LIMIT 20');$s->execute([$uid]);json($s->fetchAll(PDO::FETCH_ASSOC));}
 if($a==='notifications-read'){$db->prepare('UPDATE notifications SET read_at=CURRENT_TIMESTAMP WHERE user_id=?')->execute([$uid]);json(['ok'=>1]);}
 if($a==='task'){$pid=(int)$in['project_id'];requireProject($pid,$uid,true);$title=trim((string)($in['title']??''));if(!$title)json(['error'=>'Inserisci il testo del task']);$priority=in_array($in['priority']??'medium',['low','medium','high'],true)?$in['priority']:'medium';$due=trim((string)($in['due_date']??''));if($due!==''&&!preg_match('/^\d{4}-\d{2}-\d{2}$/',$due))$due='';if(!empty($in['id'])){$s=$db->prepare('UPDATE tasks SET title=?,done=?,due_date=?,priority=? WHERE id=? AND project_id=?');$s->execute([$title,!empty($in['done'])?1:0,$due,$priority,(int)$in['id'],$pid]);}else{$s=$db->prepare('INSERT INTO tasks(project_id,title,done,due_date,priority) VALUES(?,?,0,?,?)');$s->execute([$pid,$title,$due,$priority]);}event($uid,$pid,'Task aggiornato');json(['ok'=>1]);}
 if($a==='delete-task'){$pid=(int)$in['project_id'];requireProject($pid,$uid,true);$s=$db->prepare('DELETE FROM tasks WHERE id=? AND project_id=?');$s->execute([(int)($in['id']??0),$pid]);event($uid,$pid,'Task eliminato');json(['ok'=>1]);}
 if($a==='project-link'){$pid=(int)($in['project_id']??0);requireProject($pid,$uid,true);$link=projectLink($in['url']??'');if(!$link)json(['error'=>'Inserisci un URL HTTP o HTTPS valido']);$label=trim((string)($in['label']??''));if($label==='')$label=$link['host'];$s=$db->prepare('INSERT INTO project_links(project_id,label,url,favicon_url) VALUES(?,?,?,?)');$s->execute([$pid,substr($label,0,120),$link['url'],$link['favicon_url']]);event($uid,$pid,'Link aggiunto al progetto');json(['ok'=>1]);}
 if($a==='remove-project-link'){$pid=(int)($in['project_id']??0);requireProject($pid,$uid,true);$s=$db->prepare('DELETE FROM project_links WHERE id=? AND project_id=?');$s->execute([(int)($in['id']??0),$pid]);event($uid,$pid,'Link rimosso dal progetto');json(['ok'=>1]);}
 if($a==='location'){requireProject((int)$in['project_id'],$uid,true);$s=$db->prepare('INSERT INTO locations(project_id,computer_id,computer,folder) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM computers WHERE id=? AND user_id=?)');$s->execute([(int)$in['project_id'],(int)$in['computer_id'],'',trim($in['folder']),(int)$in['computer_id'],$uid]);json(['ok'=>1]);}
 if($a==='update-location'){$pid=(int)($in['project_id']??0);requireProject($pid,$uid,true);$folder=trim($in['folder']??'');if(!$folder)json(['error'=>'Inserisci un percorso']);$s=$db->prepare('UPDATE locations SET folder=? WHERE id=? AND project_id=?');$s->execute([$folder,(int)($in['id']??0),$pid]);json(['ok'=>1]);}
 if($a==='remove-location'){requireProject((int)$in['project_id'],$uid,true);$s=$db->prepare('DELETE FROM locations WHERE id=? AND project_id=?');$s->execute([(int)$in['id'],(int)$in['project_id']]);json(['ok'=>1]);}
 if($a==='git-info'){if($gitServiceUrl){try{json(gitServiceRequest('git-info',$in['path']??''));}catch(Throwable $e){json(['error'=>$e->getMessage()]);}}$path=validGitPath($in['path']??'');if(!$path)json(['error'=>'Percorso Git non valido o non autorizzato']);$run=function($cmd)use($path){return trim((string)shell_exec('git -C '.escapeshellarg($path).' '.$cmd.' 2>/dev/null'));};$line=$run('log -1 --format=%s|%cI');$parts=explode('|',$line,2);$branches=array_values(array_filter(explode("\n",$run('for-each-ref --format=%(refname:short)|%(objectname:short)|%(subject) refs/heads refs/remotes'))));json(['ok'=>1,'last_commit'=>$parts[0]??'','commit_date'=>$parts[1]??'','branch'=>($run('branch --show-current')?:'HEAD'),'branches'=>$branches]);}
 if($a==='git-tree'){if($gitServiceUrl){try{json(gitServiceRequest('git-tree',$in['path']??''));}catch(Throwable $e){json(['error'=>$e->getMessage()]);}}$path=validGitPath($in['path']??'');if(!$path)json(['error'=>'Percorso Git non valido o non autorizzato']);$log=shell_exec('git -C '.escapeshellarg($path).' log --all --date=short --pretty=format:%h|%ad|%an|%D|%s --max-count=120 2>/dev/null');json(['ok'=>1,'commits'=>array_values(array_filter(explode("\n",trim((string)$log))))]);}
 if($a==='github-info'){try{json(['ok'=>1]+githubInfo($in['url']??''));}catch(Throwable $e){json(['error'=>$e->getMessage()]);}}
}
?><!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Project Hub di carico</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet"><link rel="stylesheet" href="assets/style.css?v=2"></head><body>
<div id="loginScreen" class="login-screen" hidden>
  <div class="waybill login-box">
    <div class="waybill-head">
      <div class="brand"><span class="brand-stamp">ph</span><span>project<b>hub</b></span></div>
      <span class="waybill-no">project hub</span>
    </div>
    <h1 id="authTitle">Accedi</h1>
    <p class="waybill-sub">Tutti i tuoi progetti, su tutte le tue macchine.</p>
    <form id="authForm" novalidate>
      <label id="authNameWrap" hidden>Nome <input id="authName" autocomplete="name"></label>
      <label>Email <input id="authEmail" type="email" required autocomplete="email" placeholder="tu@email.it"></label>
      <label>Password <input id="authPassword" type="password" required minlength="8" autocomplete="current-password"></label>
      <button class="primary" type="submit">Accedi</button>
      <p id="authError" class="auth-error" role="alert"></p>
    </form>
    <button class="auth-switch" id="authSwitch" type="button">Non hai un account? Registrati</button>
  </div>
</div>
<div class="app">
<aside>
  <div class="brand"><span class="brand-stamp">ph</span><span>project<b>hub</b></span></div>
  <nav aria-label="Navigazione principale">
    <button type="button" class="nav active" data-view="overview"><svg viewBox="0 0 16 16"><path d="M2 13V6l6-4 6 4v7"/><path d="M5.5 13v-4h5v4"/></svg> Panoramica</button>
    <button type="button" class="nav" data-view="projects"><svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="10" rx="1"/><path d="M2 7h12M6 7v6"/></svg> Progetti <b id="navCount">0</b></button>
    <button type="button" class="nav" data-view="tasks"><svg viewBox="0 0 16 16"><path d="M3 8.5l3 3 7-8"/></svg> Task</button>
    <button type="button" class="nav" data-view="computers"><svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="8" rx="1"/><path d="M5 14h6M8 11v3"/></svg> Computer</button>
  </nav>
  <div class="side-bottom">
    <div class="tip">
      <strong>Dove vivono i progetti</strong>
      <p>Registra computer e cartelle locali: saprai sempre dove sta ogni repository.</p>
    </div>
    <div class="profile">
      <div class="avatar" id="sideAvatar" aria-hidden="true">–</div>
      <div><strong id="sideName">…</strong><small>Area personale</small></div>
      <button type="button" class="profile-more" id="profileMore" aria-label="Menu utente" aria-haspopup="true">⋮</button>
    </div>
  </div>
</aside>
<main>
  <header>
    <div class="mobile-brand"><span class="brand-stamp">ph</span> <b>project<b class="accent">hub</b></b></div>
    <div class="crumb">Project Hub <span aria-hidden="true">/</span> <strong id="pageTitle">Panoramica</strong></div>
    <div class="header-actions">
      <button type="button" class="icon-btn" id="notifBtn" title="Notifiche" aria-label="Notifiche"><svg viewBox="0 0 16 16"><path d="M8 2a4 4 0 0 0-4 4c0 4-1.5 5-1.5 5h11S12 10 12 6a4 4 0 0 0-4-4z"/><path d="M6.5 13.5a1.5 1.5 0 0 0 3 0"/></svg><i class="notif-dot" hidden></i></button>
      <button type="button" class="avatar small" id="headerAvatar" aria-label="Menu utente">–</button>
    </div>
  </header>
  <section class="content">
    <div class="welcome">
      <div><h1 id="greeting">Project Hub</h1><p class="sub" id="fleetLine">Caricamento…</p></div>
      <button type="button" class="primary" id="newBtn">＋ Nuovo progetto</button>
    </div>
    <div class="stats" role="group" aria-label="Riepilogo">
      <div class="stat"><small>Da rivedere</small><strong id="openStat">0</strong><em id="openDelta">da risolvere</em></div>
      <div class="stat"><small>Task scaduti</small><strong id="taskStat">0</strong><em>in ritardo</em></div>
      <div class="stat"><small>Aggiornati di recente</small><strong id="commitStat">0</strong><em>progetti</em></div>
    </div>
    <div class="section-head">
      <div><h2 id="sectionTitle">Progetti</h2><p id="sectionSubtitle">ordinati per ultimo aggiornamento</p></div>
      <div class="tools">
        <div class="search"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg><input id="search" placeholder="Cerca progetto…" aria-label="Cerca"></div>
        <select id="filter" aria-label="Filtra per stato"><option value="all">Tutti gli stati</option><option value="active">In corso</option><option value="paused">In pausa</option><option value="completed">Completati</option></select>
        <select id="taskFilter" hidden aria-label="Filtra per scadenza"><option value="all">Tutti i task aperti</option><option value="today">Oggi</option><option value="week">Prossimi 7 giorni</option><option value="overdue">Scaduti</option><option value="nodate">Senza scadenza</option></select>
        <select id="taskPriorityFilter" hidden aria-label="Filtra per priorità"><option value="all">Tutte le priorità</option><option value="high">Alta priorità</option><option value="medium">Media priorità</option><option value="low">Bassa priorità</option></select>
        <div class="view-toggle" role="group" aria-label="Vista"><button type="button" class="view-btn active" data-viewmode="manifest" aria-label="Vista tabella"><svg viewBox="0 0 16 16"><path d="M2 4h12M2 8h12M2 12h12"/></svg></button><button type="button" class="view-btn" data-viewmode="cards" aria-label="Vista schede"><svg viewBox="0 0 16 16"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg></button></div>
      </div>
    </div>
    <div id="projectGrid" class="manifest-host"></div>
    <div id="empty" class="empty" hidden>
      <svg class="empty-mark" viewBox="0 0 48 48" aria-hidden="true"><rect x="6" y="10" width="36" height="28" rx="2"/><path d="M6 18h36M14 26h12M14 31h8"/></svg>
      <h3>Nessun progetto</h3><p>Crea il primo progetto per iniziare.</p>
      <button type="button" class="primary" id="emptyBtn">＋ Nuovo progetto</button>
    </div>
  </section>
</main>
</div>
<div class="modal-wrap" id="modal"><div class="modal waybill" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
  <button type="button" class="close" id="close" aria-label="Chiudi">×</button>
  <div class="waybill-head"><h2 id="modalTitle">Nuovo progetto</h2><span class="waybill-no" id="modalNo">nuovo</span></div>
  <form id="projectForm">
    <input type="hidden" id="projectId">
    <label>Nome progetto <input id="name" required placeholder="es. Portfolio personale"></label>
    <label>Descrizione <textarea id="description" placeholder="Di cosa ti stai occupando?"></textarea></label>
    <div class="row">
      <label>Stato<select id="status"><option value="active">In corso</option><option value="paused">In pausa</option><option value="completed">Completato</option></select></label>
      <label>Provider<select id="provider"><option>GitHub</option><option>Gitea</option><option>GitLab</option></select></label>
    </div>
    <label>URL repository <input id="repo_url" type="url" placeholder="https://github.com/..."></label>
    <div id="gitPreview" class="git-preview" hidden></div>
    <div class="form-actions"><button type="button" class="secondary" id="cancel">Annulla</button><button class="primary">Salva progetto</button></div>
  </form>
</div></div>
<div class="modal-wrap" id="detailModal"><div class="modal waybill detail-modal" role="dialog" aria-modal="true"><button type="button" class="close" id="detailClose" aria-label="Chiudi">×</button><div id="detail"></div></div></div>
<div class="user-menu" id="userMenu" role="menu"><button type="button" id="themeToggle">Tema chiaro</button><button type="button" id="logoutBtn">Esci</button></div>
<script src="assets/app.js?v=2"></script></body></html>
