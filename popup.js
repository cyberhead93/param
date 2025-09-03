async function scanPage() {
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  if (!tab || !tab.id) return;

  // Inject content script and run it on the active tab
  try {
    const [{result}] = await chrome.scripting.executeScript({
      target: {tabId: tab.id},
      func: () => {
        // This function runs inside the page context
        function getQueryParams(url) {
          const params = {};
          try {
            const query = new URL(url).searchParams;
            for (const [k, v] of query.entries()) params[k] = v;
          } catch(e){}
          return params;
        }

        function extractForms() {
          const forms = [];
          document.querySelectorAll('form').forEach(form => {
            const method = (form.method || 'GET').toUpperCase();
            const action = form.action || window.location.href;
            const inputs = [];
            form.querySelectorAll('input, textarea, select').forEach(inp => {
              if (inp.name) {
                inputs.push({name: inp.name, type: inp.type || inp.tagName.toLowerCase(), value: inp.value || ''});
              }
            });
            forms.push({method, action, inputs});
          });
          return forms;
        }

        function linksWithParams() {
          const links = [];
          document.querySelectorAll('a[href]').forEach(a => {
            try {
              const href = a.href;
              if (href.includes('?')) {
                const params = {};
                new URL(href).searchParams.forEach((v,k) => { params[k] = v; });
                links.push({href, params});
              }
            } catch(e){}
          });
          return links;
        }

        function extractJsNames() {
          const txt = Array.from(document.scripts || []).map(s => s.textContent || '').join('\n');
          const names = new Set();
          // Very simple heuristics to get variable/function parameter names (benign)
          const varRe = /\bvar\s+(\w+)\s*=|\blet\s+(\w+)\s*=|\bconst\s+(\w+)\s*=/g;
          let m;
          while ((m = varRe.exec(txt)) !== null) {
            const name = m[1] || m[2] || m[3];
            if (name) names.add(name);
          }
          const funcRe = /function\s+\w*\s*\(([^)]*)\)/g;
          while ((m = funcRe.exec(txt)) !== null) {
            const params = m[1].split(',').map(p => p.trim()).filter(Boolean);
            params.forEach(p => names.add(p));
          }
          return Array.from(names);
        }

        return {
          url: window.location.href,
          pageQueryParams: getQueryParams(window.location.href),
          forms: extractForms(),
          linksWithParams: linksWithParams(),
          jsNames: extractJsNames(),
          timestamp: new Date().toISOString()
        };
      }
    });

    // Display results
    const res = result;
    document.getElementById('info').textContent = `Scanned: ${res.url}`;
    const resultsEl = document.getElementById('results');
    resultsEl.innerHTML = '';

    const addSection = (title, content) => {
      const t = document.createElement('div');
      t.className = 'section-title';
      t.textContent = title;
      resultsEl.appendChild(t);
      const pre = document.createElement('pre');
      pre.textContent = JSON.stringify(content, null, 2);
      resultsEl.appendChild(pre);
    };

    addSection('Page URL Query Params', res.pageQueryParams);
    addSection('Forms (method/action/inputs)', res.forms);
    addSection('Links with Query Params', res.linksWithParams);
    addSection('JavaScript Variable/Param Names (heuristic)', res.jsNames);

    // Enable export
    const exportBtn = document.getElementById('exportBtn');
    exportBtn.disabled = false;
    exportBtn.onclick = () => {
      const blob = new Blob([JSON.stringify(res, null, 2)], {type: 'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'page_params.json';
      a.click();
      URL.revokeObjectURL(url);
    };

  } catch (err) {
    document.getElementById('info').textContent = 'Error: ' + err.message;
  }
}

document.getElementById('scanBtn').addEventListener('click', scanPage);
