const http = require('http');

async function testUpload() {
  const loginRes = await new Promise(r => {
    const req = http.request({ hostname: 'localhost', port: 3000, path: '/api/auth/login-pin', method: 'POST', headers: { 'Content-Type': 'application/json' } }, res => {
      let raw = ''; res.on('data', c => raw += c); res.on('end', () => r(JSON.parse(raw)));
    });
    req.write(JSON.stringify({ pin: '925925' }));
    req.end();
  });
  const token = loginRes.token;

  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const fileContent = 'Hello Cloud Drive!';
  let parts = [];
  parts.push('--' + boundary + '\r\n');
  parts.push('Content-Disposition: form-data; name="file"; filename="test.txt"\r\n');
  parts.push('Content-Type: text/plain\r\n\r\n');
  parts.push(fileContent + '\r\n');
  parts.push('--' + boundary + '--\r\n');
  const body = Buffer.from(parts.join(''));

  const req = http.request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/cloud/upload',
    method: 'POST',
    headers: {
      'Content-Type': 'multipart/form-data; boundary=' + boundary,
      'Content-Length': body.length,
      'Authorization': 'Bearer ' + token
    }
  }, res => {
    let raw = ''; res.on('data', c => raw += c); res.on('end', () => console.log('Upload response:', res.statusCode, raw));
  });
  req.write(body);
  req.end();
}
testUpload();
