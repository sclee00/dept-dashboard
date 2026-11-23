package main

// Gemini inside the program: a second Edge view, placed over the dashboard's "Gemini" tab (bottom panel).
// It uses the same sign-in store as the dashboard, so logging in to Google there once is enough.
// The question is typed by the same script the Chrome extension uses (run.js).

import (
	_ "embed"
	"encoding/json"
	"path/filepath"
	"unsafe"

	webview2 "github.com/jchv/go-webview2"
)

//go:embed run.js
var runJS string

var (
	pSetParent = user32.NewProc("SetParent")
	gemWV      webview2.WebView
	gemHwnd    uintptr
	gemPending string // the script to run once Gemini has loaded
	gemPlaced  [4]int
	gemShown   bool
)

const gemURL = "https://gemini.google.com/app"

func gemEnsure() bool {
	if gemWV != nil {
		return true
	}
	gemWV = webview2.NewWithOptions(webview2.WebViewOptions{
		AutoFocus:     false,
		DataPath:      filepath.Join(dataDir(), "WebView2"),
		WindowOptions: webview2.WindowOptions{Title: "Gemini", Width: 600, Height: 400},
	})
	if gemWV == nil {
		return false
	}
	gemHwnd = uintptr(gemWV.Window())
	pShowWin.Call(gemHwnd, 0)                                                      // hidden until placed
	const gwlStyle, wsChild, wsClipSiblings = ^uintptr(15), 0x40000000, 0x04000000 // GWL_STYLE = -16
	pSetWLP.Call(gemHwnd, gwlStyle, wsChild|wsClipSiblings)
	pSetParent.Call(gemHwnd, hwnd)
	gemWV.Bind("gemReady", func() bool {
		if gemPending != "" {
			s := gemPending
			gemPending = ""
			gemWV.Eval(s)
		}
		return true
	})
	gemWV.Bind("gemStatus", func(id, t string) bool {
		wv.Eval("window.__hostGemStatus && window.__hostGemStatus(" + jsStr(id) + "," + jsStr(t) + ")")
		return true
	})
	gemWV.Bind("gemDone", func(id, r string) bool {
		wv.Eval("window.__hostGemDone && window.__hostGemDone(" + jsStr(id) + "," + jsStr(r) + ")")
		return true
	})
	gemWV.Init(runJS + `
;(() => {
  if (location.hostname !== 'gemini.google.com') return;
  const go = () => { if (window.gemReady) window.gemReady(); };
  if (document.readyState === 'complete') setTimeout(go, 800); else addEventListener('load', () => setTimeout(go, 800));
})();`)
	gemWV.Navigate(gemURL)
	return true
}

func jsStr(s string) string { b, _ := json.Marshal(s); return string(b) }

// place (or hide) the Gemini view over the dashboard's Gemini tab; x,y,w,h are in the window's client pixels
func gemPlace(x, y, w, h int, show bool) bool {
	if !show && gemWV == nil {
		return true
	}
	if !gemEnsure() {
		return false
	}
	if !show || w < 40 || h < 40 {
		if gemShown {
			pShowWin.Call(gemHwnd, 0)
			gemShown = false
		}
		return true
	}
	const swpShow, noActivate = 0x40, 0x10
	pSetWinPos.Call(gemHwnd, 0, uintptr(x), uintptr(y), uintptr(w), uintptr(h), swpShow|noActivate) // HWND_TOP
	gemPlaced, gemShown = [4]int{x, y, w, h}, true
	return true
}

// ask Gemini: start a fresh chat, then run the same typing script as the extension
func gemAsk(id, prompt string, wantJSON bool, imagesJSON string) bool {
	if !gemEnsure() {
		return false
	}
	if imagesJSON == "" {
		imagesJSON = "[]"
	}
	j := "false"
	if wantJSON {
		j = "true"
	}
	gemPending = `(async () => {
  const id = ` + jsStr(id) + `;
  window.__gbStatus = t => { try { window.gemStatus(id, String(t)); } catch (e) {} };
  let r;
  try { r = await runInGemini(` + jsStr(prompt) + `, ` + j + `, 480000, ` + imagesJSON + `); }
  catch (e) { r = { error: 'run', message: String((e && e.message) || e) }; }
  window.gemDone(id, JSON.stringify(r));
})();`
	gemWV.Navigate(gemURL)
	return true
}

func gemReload() bool {
	if gemEnsure() {
		gemPending = ""
		gemWV.Navigate(gemURL)
	}
	return true
}

var _ = unsafe.Pointer(nil)
