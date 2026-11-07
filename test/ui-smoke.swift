import AppKit
import WebKit

final class Smoke: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
    var view: WKWebView!
    var window: NSWindow!
    var done = false

    func start() {
        let input = FileHandle.standardInput.readDataToEndOfFile()
        guard let address = String(data: input, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines),
              let url = URL(string: address) else { finish(false, "Missing UI test URL"); return }
        let config = WKWebViewConfiguration()
        config.userContentController.add(self, name: "smoke")
        config.userContentController.addUserScript(WKUserScript(source: "window.testErrors=[];addEventListener('error',e=>testErrors.push(e.message));addEventListener('unhandledrejection',e=>testErrors.push(String(e.reason)));", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        view = WKWebView(frame: NSRect(x: 0, y: 0, width: 1180, height: 850), configuration: config)
        view.navigationDelegate = self
        window = NSWindow(contentRect: view.frame, styleMask: [.titled], backing: .buffered, defer: false)
        window.title = "Own the Fix · synthetic UI test"
        window.contentView = view
        window.orderFrontRegardless()
        view.load(URLRequest(url: url))
        DispatchQueue.main.asyncAfter(deadline: .now() + 45) { [weak self] in
            if self?.done == false { self?.finish(false, "UI test timed out") }
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if let action = message.body as? String {
            print("ACTION:\(action)")
            fflush(stdout)
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        let script = """
        const until=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,100));}throw Error('UI checkpoint timed out');};
        const submit=(id,values)=>{const f=document.querySelector(id);for(const [key,value]of Object.entries(values))f.elements[key].value=value;f.requestSubmit();};
        await until(()=>document.querySelector('#start-case'));
        document.querySelector('#start-case').click();
        await until(()=>document.querySelector('#hypothesis-form'));
        submit('#hypothesis-form',{quote:'Synthetic hypothesis: an older response finishes late.'});
        await until(()=>document.querySelector('#checkpoint-title').textContent.includes('agent should explain'));
        window.webkit.messageHandlers.smoke.postMessage('explain');
        await until(()=>document.querySelector('#prediction-form'));
        submit('#prediction-form',{quote:'Synthetic prediction: the older result is displayed last.'});
        await until(()=>document.querySelector('#choice-form'));
        const f=document.querySelector('#choice-form');
        f.querySelector('input[value="request-id"]').checked=true;
        f.elements.quote.value='Synthetic choice: guard results because cancellation is not guaranteed.';
        f.requestSubmit();
        await until(()=>document.querySelector('#checkpoint-title').textContent.includes('agent can execute'));
        window.webkit.messageHandlers.smoke.postMessage('implement');
        await until(()=>document.querySelector('#teachback-form'));
        submit('#teachback-form',{quote:'Synthetic teach-back: only the latest started request may update results.',testLimit:'These tests do not verify real-network UI behavior.'});
        await until(()=>document.querySelector('#download-receipt'));
        if(testErrors.length)throw Error(testErrors.join('; '));
        if(!document.querySelector('#human-notes').textContent.includes('Synthetic hypothesis'))throw Error('Human reasoning was not preserved');
        if(!document.querySelector('#test-summary').textContent.includes('4 pass'))throw Error('Actual verification missing');
        await until(()=>document.querySelector('#daily-recap').textContent.includes('Synthetic teach-back'));
        if(document.querySelector('#copy-pr').disabled)throw Error('PR summary did not unlock after teach-back');
        if(!document.querySelector('#daily-recap').textContent.includes('not automatically linked to a PR'))throw Error('Recap provenance missing');
        if(!document.querySelector('#recap-day').value)throw Error('Saved recap date missing');
        const recap=await fetch('/api/recap',{headers:{Authorization:'Bearer '+sessionStorage.getItem('own-fix-token')}});
        if(!recap.ok||!(await recap.text()).includes('Synthetic teach-back'))throw Error('Saved recap download failed');
        return true;
        """
        webView.callAsyncJavaScript(script, arguments: [:], in: nil, in: .page) { [weak self] result in
            guard let self else { return }
            switch result {
            case .failure(let error): self.finish(false, (error as NSError).userInfo["WKJavaScriptExceptionMessage"] as? String ?? error.localizedDescription)
            case .success:
                if let path = ProcessInfo.processInfo.environment["OWN_FIX_SNAPSHOT"] {
                    self.view.takeSnapshot(with: nil) { image, error in
                        guard let image, let data = image.tiffRepresentation, let bitmap = NSBitmapImageRep(data: data),
                              let png = bitmap.representation(using: .png, properties: [:]) else {
                            self.finish(false, error?.localizedDescription ?? "Snapshot failed"); return
                        }
                        do { try png.write(to: URL(fileURLWithPath: path)); self.finish(true, "Guided UI workflow passed") }
                        catch { self.finish(false, error.localizedDescription) }
                    }
                } else { self.finish(true, "Guided UI workflow passed") }
            }
        }
    }

    func finish(_ success: Bool, _ message: String) {
        guard !done else { return }
        done = true
        print(message)
        exit(success ? 0 : 1)
    }
}
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let smoke = Smoke()
smoke.start()
app.run()
