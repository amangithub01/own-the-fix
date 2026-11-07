import AppKit
import WebKit

final class Walkthrough: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
    var view: WKWebView!
    var window: NSWindow!
    var finished = false
    var outputDirectory = ""

    func start() {
        let data = FileHandle.standardInput.readDataToEndOfFile()
        guard let address = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines),
              let url = URL(string: address),
              let output = ProcessInfo.processInfo.environment["OWN_FIX_FRAME_DIR"] else {
            finish(false, "Missing walkthrough configuration"); return
        }
        outputDirectory = output
        let config = WKWebViewConfiguration()
        config.userContentController.add(self, name: "walkthrough")
        config.userContentController.addUserScript(WKUserScript(source: "window.captureWaiting=null;window.testErrors=[];addEventListener('error',e=>testErrors.push(e.message));", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        view = WKWebView(frame: NSRect(x: 0, y: 0, width: 1280, height: 720), configuration: config)
        view.navigationDelegate = self
        window = NSWindow(contentRect: view.frame, styleMask: [.titled], backing: .buffered, defer: false)
        window.title = "Own the Fix · labelled sample walkthrough"
        window.contentView = view
        window.orderFrontRegardless()
        view.load(URLRequest(url: url))
        DispatchQueue.main.asyncAfter(deadline: .now() + 90) { [weak self] in
            if self?.finished == false { self?.finish(false, "Walkthrough capture timed out") }
        }
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? String else { return }
        if body.hasPrefix("ACTION:") {
            print(body)
            fflush(stdout)
            return
        }
        guard body.hasPrefix("CAPTURE:"), let index = Int(body.dropFirst(8)), (1...9).contains(index) else { return }
        view.takeSnapshot(with: nil) { [weak self] image, error in
            guard let self else { return }
            guard let image, let data = image.tiffRepresentation, let bitmap = NSBitmapImageRep(data: data),
                  let png = bitmap.representation(using: .png, properties: [:]) else {
                self.finish(false, error?.localizedDescription ?? "Snapshot failed"); return
            }
            let path = URL(fileURLWithPath: self.outputDirectory).appendingPathComponent(String(format: "frame-%02d.png", index))
            do {
                try png.write(to: path)
                self.view.evaluateJavaScript("window.captureWaiting=null;")
            } catch { self.finish(false, error.localizedDescription) }
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        let defaultScript = """
        const until=async fn=>{for(let i=0;i<250;i++){if(fn())return;await new Promise(r=>setTimeout(r,100));}throw Error('Walkthrough checkpoint timed out');};
        const pause=()=>new Promise(r=>setTimeout(r,350));
        const banner=document.createElement('div');
        banner.textContent='PROTOTYPE WALKTHROUGH · SAMPLE ANSWERS · LOCAL CLI — NOT LIVE DISCORD OR WISPR FOOTAGE';
        Object.assign(banner.style,{position:'fixed',top:'0',left:'0',width:'100%',zIndex:'10000',height:'30px',background:'#ead3a5',color:'#18202e',font:'bold 11px -apple-system,sans-serif',display:'flex',alignItems:'center',justifyContent:'center',letterSpacing:'.7px'});
        document.body.append(banner);
        document.body.style.paddingTop='30px';
        const capture=async(n,selector)=>{if(selector){const target=document.querySelector(selector);window.scrollTo(0,Math.max(0,window.scrollY+target.getBoundingClientRect().top-45));}else window.scrollTo(0,0);document.querySelector('#toast').style.opacity='0';await pause();captureWaiting=n;window.webkit.messageHandlers.walkthrough.postMessage('CAPTURE:'+n);await until(()=>captureWaiting===null);};
        const fill=(id,values)=>{const f=document.querySelector(id);for(const [key,value]of Object.entries(values))f.elements[key].value=value;return f;};
        await until(()=>document.querySelector('#start-case'));
        await capture(1);
        document.querySelector('.intro').style.display='none';
        document.querySelector('#start-case').click();
        await until(()=>document.querySelector('#hypothesis-form'));
        const hypothesis=fill('#hypothesis-form',{quote:'Sample hypothesis: older requests can finish later. Each invocation still updates the display, so completion order may matter more than typing order.'});
        await capture(2,'.checkpoint-card');
        hypothesis.requestSubmit();
        await until(()=>document.querySelector('#checkpoint-title').textContent.includes('agent should explain'));
        window.webkit.messageHandlers.walkthrough.postMessage('ACTION:explain');
        await until(()=>document.querySelector('#prediction-form'));
        document.querySelectorAll('#explanation details').forEach(d=>d.open=true);
        await capture(3,'.source-card');
        const prediction=fill('#prediction-form',{quote:'Sample prediction: the final display will show cars. Request A finishes last and line 4 publishes its result without checking whether B is now current.'});
        await capture(4,'.checkpoint-card');
        prediction.requestSubmit();
        await until(()=>document.querySelector('#choice-form'));
        const choice=document.querySelector('#choice-form');
        choice.querySelector('input[value="request-id"]').checked=true;
        choice.elements.quote.value='Sample choice: use a latest-request guard. It works with a transport that cannot be cancelled. I accept that older requests still consume resources.';
        await capture(5,'.checkpoint-card');
        choice.requestSubmit();
        await until(()=>document.querySelector('#checkpoint-title').textContent.includes('agent can execute'));
        window.webkit.messageHandlers.walkthrough.postMessage('ACTION:implement');
        await until(()=>document.querySelector('#teachback-form'));
        const outputs=document.querySelectorAll('#test-output details');
        if(outputs[1])outputs[1].open=true;
        await capture(6,'#evidence-card');
        const teachback=fill('#teachback-form',{quote:'Sample explanation: each search gets an increasing request number. Only the request matching the latest number can publish results, so a late old response cannot overwrite the current screen.',testLimit:'The tests use controlled promises. They do not establish real-network behavior, production loading indicators, or accessibility.'});
        await capture(7,'.checkpoint-card');
        teachback.requestSubmit();
        await until(()=>document.querySelector('#download-receipt'));
        await capture(8,'.checkpoint-card');
        if(testErrors.length)throw Error(testErrors.join('; '));
        return true;
        """
        let script: String
        if let custom = ProcessInfo.processInfo.environment["OWN_FIX_CAPTURE_SCRIPT"] {
            do { script = "return await (\(try String(contentsOfFile: custom, encoding: .utf8)))();" }
            catch { finish(false, error.localizedDescription); return }
        } else { script = defaultScript }
        webView.callAsyncJavaScript(script, arguments: [:], in: nil, in: .page) { [weak self] result in
            switch result {
            case .success: self?.finish(true, "Captured labelled prototype scenes")
            case .failure(let error):
                self?.finish(false, (error as NSError).userInfo["WKJavaScriptExceptionMessage"] as? String ?? error.localizedDescription)
            }
        }
    }

    func finish(_ success: Bool, _ message: String) {
        guard !finished else { return }
        finished = true
        print(message)
        exit(success ? 0 : 1)
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let walkthrough = Walkthrough()
walkthrough.start()
app.run()
