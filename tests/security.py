#!/usr/bin/env python3
"""Exercise privileged integration boundaries in an isolated PHP container."""
import http.cookiejar
import json
import os
import pathlib
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

root = pathlib.Path(__file__).resolve().parent.parent
with tempfile.TemporaryDirectory() as tmp:
    shutil.copy(root / 'index.php', tmp)
    pathlib.Path(tmp, 'data').mkdir(mode=0o777)
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    container_name = f'project-hub-security-test-{port}'
    container = subprocess.Popen(['docker', 'run', '--rm', '--name', container_name, '-p', f'127.0.0.1:{port}:8080',
        '-v', f'{tmp}:/app', '-w', '/app', '-e', 'ALLOW_REGISTRATION=1',
        '-e', 'GIT_SERVICE_USERS=2', '--user', f'{os.getuid()}:{os.getgid()}',
        '--entrypoint', 'php', 'project-manager-app', '-d', 'session.save_path=/tmp', '-S', '0.0.0.0:8080'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        base = f'http://127.0.0.1:{port}/index.php?api='
        def client():
            return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        def call(opener, action, payload=None, csrf=None):
            headers = {'Content-Type': 'application/json'}
            if csrf: headers['X-CSRF-Token'] = csrf
            request = urllib.request.Request(base + action, headers=headers,
                data=None if payload is None else json.dumps(payload).encode())
            try:
                response = opener.open(request, timeout=5)
            except urllib.error.HTTPError as error:
                response = error
            with response:
                return json.load(response)
        a, b = client(), client()
        for attempt in range(50):
            try:
                session = call(a, 'session')
                break
            except (OSError, urllib.error.URLError):
                time.sleep(.1)
        else: raise RuntimeError('PHP server did not start')
        user_a = call(a, 'register', {'name':'A', 'email':'a@example.test', 'password':'password123'}, session['csrf'])
        user_b = call(b, 'register', {'name':'B', 'email':'b@example.test', 'password':'password123'}, call(b, 'session')['csrf'])
        assert user_a['user']['id'] == 2 and user_b['user']['id'] == 3
        for opener, user in ((a, user_a), (b, user_b)):
            token = user['csrf']
            project = call(opener, 'save', {'name':'Test'}, token)['id']
            call(opener, 'computer', {'name':'Host'}, token)
            computer = call(opener, 'computers')[0]['id']
            call(opener, 'location', {'project_id':project, 'computer_id':computer, 'folder':'/private/repo'}, token)
            result = call(opener, 'git-info', {'path':'/private/repo'}, token)
            if opener is a:
                assert result['error'] == 'Percorso Git non valido o non autorizzato', result
            else:
                assert result['error'] == 'Percorso non associato a un progetto a cui hai accesso', result
            result = call(opener, 'save', {'name':'Bad', 'repo_url':'javascript:alert(1)'}, token)
            assert 'URL repository non valido' in result.get('error',''), result
        print('Security integration checks: OK')
    finally:
        subprocess.run(['docker', 'rm', '-f', container_name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
        container.wait(timeout=10)
