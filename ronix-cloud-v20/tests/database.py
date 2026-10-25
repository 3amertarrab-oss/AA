"""Real PostgreSQL tests; auth JWT claims/storage metadata are test stand-ins for Supabase."""
import subprocess,json,uuid,concurrent.futures
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];checks=[]
def sql(text,ok=True):
 r=subprocess.run(['docker','exec','-i','ronix-v20-test-db','psql','-X','-U','postgres','-v','ON_ERROR_STOP=1','-At'],input=text,text=True,capture_output=True)
 if ok and r.returncode:raise RuntimeError(r.stderr)
 if not ok:return r.returncode!=0
 return r.stdout.strip().splitlines()[-1] if r.stdout.strip() else ''
def check(name,ok):
 assert ok,name
 checks.append(name);print('PASS',name,flush=True)
sql((ROOT/'tests/postgres_bootstrap.sql').read_text())
schema=(ROOT/'schema.sql').read_text();sql(schema);sql(schema)
u1='10000000-0000-4000-8000-000000000001';u2='10000000-0000-4000-8000-000000000002';u3='10000000-0000-4000-8000-000000000003'
sql(f"insert into auth.users values('{u1}','owner@example.com'),('{u2}','other@example.com'),('{u3}','blocked@example.com'); insert into ronix_private.allowed_emails values('owner@example.com'),('other@example.com');")
def as_user(uid,email,query):return "set role authenticated;select set_config('request.jwt.claims',"+"'"+json.dumps({'sub':uid,'email':email})+"',false);"+query
def one(q):return as_user(u1,'owner@example.com',q)
payload={'schemaVersion':19,'currency':'EGP','projects':[],'assignments':[],'payments':[]}
def commit(rev,mid,p=payload):return f"select public.ronix_commit({rev},'{mid}','{json.dumps(p)}'::jsonb);"
check('schema is safely rerunnable and creates private storage',sql("select count(*) from storage.buckets where id='ronix-files' and not public;")=='1')
check('anonymous cannot read ledger or call financial functions',sql('set role anon;select public.ronix_load();',False) and sql('set role anon;select * from public.ronix_ledger;',False))
check('unlisted authenticated account cannot load or save',sql(as_user(u3,'blocked@example.com','select public.ronix_load();'),False) and sql(as_user(u3,'blocked@example.com',commit(0,str(uuid.uuid4()))),False))
check('authorized first load is an empty ledger',json.loads(sql(one('select public.ronix_load();')))['revision']==0)
mid=str(uuid.uuid4());r=json.loads(sql(one(commit(0,mid))));check('first atomic save advances revision once',r['status']=='saved' and r['revision']==1)
r=json.loads(sql(one(commit(0,mid))));check('retrying same mutation is idempotent',r['revision']==1 and r['replayed'])
check('stale revision never overwrites newer data',json.loads(sql(one(commit(0,str(uuid.uuid4())))))['status']=='conflict' and sql(one('select public.ronix_head();'))=='1')
check('another allowed account sees no other owner ledger',json.loads(sql(as_user(u2,'other@example.com','select public.ronix_load();')))['revision']==0 and sql(as_user(u2,'other@example.com',f"select count(*) from public.ronix_ledger where owner_id='{u1}';"))=='0')
check('direct update cannot bypass compare and swap',sql(one("update public.ronix_ledger set revision=99;"),False))
check('members cannot grant themselves another email',sql(one("insert into ronix_private.allowed_emails values('intruder@example.com');"),False))
check('malformed data is rejected before writing',sql(one(commit(1,str(uuid.uuid4()),{'currency':'USD'})),False) and sql(one('select public.ronix_head();'))=='1')
with concurrent.futures.ThreadPoolExecutor(2) as pool:
 results=list(pool.map(lambda _:json.loads(sql(one(commit(1,str(uuid.uuid4()))))),range(2)))
check('simultaneous writers produce one save and one conflict',sorted(x['status'] for x in results)==['conflict','saved'] and sql(one('select public.ronix_head();'))=='2')
check('old successful mutation stays idempotent after later changes',json.loads(sql(one(commit(0,mid))))['revision']==1 and sql(one('select public.ronix_head();'))=='2')
own=f'{u1}/proof.png';other=f'{u2}/proof.png'
sql(one(f"insert into storage.objects(bucket_id,name) values('ronix-files','{own}');"))
check('own private evidence can be read',sql(one("select count(*) from storage.objects;"))=='1')
check('another user cannot read evidence',sql(as_user(u2,'other@example.com',"select count(*) from storage.objects;"))=='0')
check('cross-account uploads are rejected',sql(one(f"insert into storage.objects(bucket_id,name) values('ronix-files','{other}');"),False))
sql(one("update storage.objects set name='overwrite';delete from storage.objects;"))
check('evidence cannot be overwritten or deleted through the client role',sql("select name from storage.objects;")==own)
sql("delete from ronix_private.allowed_emails where email='owner@example.com';")
check('revoking allowed email blocks existing authenticated access',sql(one('select public.ronix_load();'),False) and sql(one('select count(*) from storage.objects;'))=='0')
out={'passed':len(checks),'checks':checks,'engine':'PostgreSQL 17; simulated Supabase auth claims and storage metadata','errors':[]};(ROOT/'tests/database-results.json').write_text(json.dumps(out,indent=2));print(json.dumps(out,indent=2))
