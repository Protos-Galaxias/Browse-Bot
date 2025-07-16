const g="/assets/content.ts-Dapdx9IB.js";console.log("contentScript666",g);chrome.sidePanel?chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:!0}):chrome.action.onClicked.addListener(()=>{chrome.sidebarAction.toggle()});let o=null,r=null;chrome.runtime.onMessage.addListener(e=>{if(e.type==="START_TASK"){if(o){t("[System]: A task is already running.");return}console.log("Service Worker: Received START_TASK",e.prompt),o={prompt:e.prompt,history:[]},d()}return!0});async function d(){if(o){t("[Agent]: Thinking...");try{const[e]=await chrome.tabs.query({active:!0,lastFocusedWindow:!0});if(!e?.id||!e.url||e.url.startsWith("chrome://")){t("[Error]: Cannot run on the current page. Please use a standard http/https page."),a();return}r=e.id;try{await chrome.scripting.executeScript({target:{tabId:r,allFrames:!0},files:[g]}),await new Promise(i=>setTimeout(i,500))}catch(i){if(console.error("Failed to inject content script:",i),i instanceof Error&&i.message.includes("Cannot access a chrome:// URL")){t("[Error]: Cannot run on Chrome-specific pages."),a();return}}t("[Agent]: Reading page content..."),console.log("qwer1234");const l=(await chrome.tabs.sendMessage(r,{type:"GET_CONTEXT"})).dom,c=await f(l);if(!c){t("[Error]: Failed to get a valid action from LLM."),a();return}await y(c)}catch(e){console.error("Agent loop error:",e),t(`[Error]: An unexpected error occurred: ${e instanceof Error?e.message:String(e)}`),a()}}}async function f(e){if(!o)return null;t("[Agent]: Asking LLM for the next step...");const{apiKey:s,model:l}=await chrome.storage.local.get(["apiKey","model"]);if(!s)return t("[Error]: OpenRouter API Key is not set. Please set it in the settings."),{action:"FINISH",result:"Task failed: API key not set."};const c=`You are an autonomous web browsing agent. Your goal is to complete the user's request.
You can see a simplified version of the web page, containing only text and interactive elements.
Interactive elements are represented by <interactive id="some-id" type="button|input|textarea|etc">text</interactive>.
You have the following tools at your disposal:

1. CLICK(id: string, comment: string) - Clicks an interactive element with the given id.
2. TYPE(id: string, text: string, comment: string) - Types text into an input field or textarea.
3. NAVIGATE(url: string, comment: string) - Navigates to a new URL.
4. FINISH(result: string) - Finishes the task and provides the final result to the user.

RULES:
- Respond ONLY with a single JSON object representing your next action.
- Think step-by-step.
- The 'comment' field should explain your reasoning for the action.
- Do not hallucinate element IDs. Only use IDs present in the page context.
- If you can't find a way to proceed, use FINISH to report the issue.
`,i=`
Task History:
${o.history.join(`
`)}

Current Page Context:
---
${e.substring(0,8e3)} 
---

User's Goal: "${o.prompt}"

Based on the context and history, what is your next single action? Respond with a JSON object.`;try{const n=await fetch("https://openrouter.ai/api/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${s}`,"Content-Type":"application/json"},body:JSON.stringify({model:l||"google/gemini-2.0-flash-exp:free",messages:[{role:"system",content:c},{role:"user",content:i}],response_format:{type:"json_object"}})});if(!n.ok){const h=await n.text();throw new Error(`LLM API request failed with status ${n.status}: ${h}`)}const m=(await n.json()).choices[0].message.content,u=JSON.parse(m),p=`[Action]: ${u.action} - ${u.comment}`;return t(p),o.history.push(p),u}catch(n){return console.error("LLM request failed:",n),t(`[Error]: LLM request failed: ${n instanceof Error?n.message:String(n)}`),null}}async function y(e){if(r)switch(e.action){case"CLICK":case"TYPE":await chrome.tabs.sendMessage(r,{type:e.action==="CLICK"?"EXECUTE_CLICK":"EXECUTE_TYPE",elementId:e.id,text:e.text}),setTimeout(d,2e3);break;case"NAVIGATE":await chrome.tabs.update(r,{url:e.url});break;case"FINISH":t(`[Result]: ${e.result}`),a();break;default:t(`[Error]: Unknown action type "${e.action}"`),a();break}}function t(e){console.log(e),chrome.runtime.sendMessage({type:"UPDATE_LOG",data:e}).catch(s=>console.error("Failed to send log to UI:",s))}function a(){chrome.runtime.sendMessage({type:"TASK_COMPLETE"}).catch(e=>console.error("Failed to send task complete to UI:",e)),o=null,r=null}chrome.tabs.onUpdated.addListener((e,s)=>{o&&e===r&&s.status==="complete"&&(console.log(`Tab ${e} updated, continuing agent loop.`),t("[Agent]: Page loaded, continuing task..."),setTimeout(d,1e3))});chrome.sidePanel?chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:!0}):chrome.sidebarAction&&chrome.action.onClicked.addListener(()=>{chrome.sidebarAction.toggle()});
