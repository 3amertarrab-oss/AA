"""Verify setup without using a real email or project credentials."""
import json,threading
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
checks=[]
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ROOT/'dist')))
threading.Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 p=b.new_page();p.add_init_script("Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw Error('clipboard unavailable')}}})")
 p.goto(f'http://127.0.0.1:{server.server_port}/setup.html')
 p.locator('#copySql').click()
 assert p.locator('#sql').input_value()==''
 checks.append('empty email does not generate an allowlist grant')
 p.locator('#email').fill("Owner+O'Neil@example.com");p.locator('#copySql').click()
 p.wait_for_function("document.getElementById('sql').value.includes('insert into ronix_private.allowed_emails')")
 sql=p.locator('#sql').input_value()
 assert "values ('owner+o''neil@example.com')" in sql and sql.startswith('-- RONIX V20:')
 assert p.locator('details').get_attribute('open') is not None
 checks.append('local setup generates full schema and safely quotes lowercase email')
 assert p.locator('#sqlLink').get_attribute('href').endswith('/ajmguynkgsrqkxtxewsj/sql/new')
 assert p.locator('#usersLink').get_attribute('href').endswith('/ajmguynkgsrqkxtxewsj/auth/users')
 checks.append('setup links point to the intended project editors')
 p.reload();assert p.locator('#sql').input_value()==''
 checks.append('entered email and generated private SQL are not persisted')
 b.close()
server.shutdown()
result={'passed':len(checks),'checks':checks,'errors':[],'environment':'Chromium on localhost with clipboard fallback forced, synthetic email; file:// navigation blocked by environment policy'}
(ROOT/'tests/setup-results.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result,indent=2))
