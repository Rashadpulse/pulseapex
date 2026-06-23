const fs = require('fs');
const path = 'd:/My Projects/AGEIS AI/frontend/src/app/page.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add import statement
if (!content.includes('import { API_BASE_URL, WS_BASE_URL }')) {
  content = content.replace(
    'import { \r\n  Shield,', 
    'import { API_BASE_URL, WS_BASE_URL } from "../config/api";\r\nimport { \r\n  Shield,'
  );
  // Also try \n in case it's LF
  content = content.replace(
    'import { \n  Shield,', 
    'import { API_BASE_URL, WS_BASE_URL } from "../config/api";\nimport { \n  Shield,'
  );
}

// 2. Remove useState definitions
content = content.replace(/\s*\/\/ Derive wsUrl dynamically[\s\S]*?const \[wsConnected, setWsConnected\] = useState\(false\);/g, '\n  const [connectionMode, setConnectionMode] = useState<"mock" | "live">("live");\n  const [wsConnected, setWsConnected] = useState(false);');

// 3. Replace template literal ${backendUrl}
content = content.replace(/\$\{backendUrl\}/g, '${API_BASE_URL}');

// 4. Replace wsUrl in WebSocket constructor
content = content.replace(/\$\{wsUrl\}/g, '${WS_BASE_URL}');

// 5. Replace backendUrl with API_BASE_URL in settings UI
content = content.replace(/value=\{backendUrl\}/g, 'value={API_BASE_URL} readOnly');
content = content.replace(/onChange=\{\(e\) => setBackendUrl\(e\.target\.value\)\}/g, '');

// 6. Replace wsUrl with WS_BASE_URL in settings UI
content = content.replace(/value=\{wsUrl\}/g, 'value={WS_BASE_URL} readOnly');
content = content.replace(/onChange=\{\(e\) => setWsUrl\(e\.target\.value\)\}/g, '');

fs.writeFileSync(path, content);
console.log('page.tsx refactored');
