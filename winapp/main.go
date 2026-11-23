// 업무대시보드 · Windows 프로그램
// A real Windows window with the dashboard inside (Microsoft Edge WebView2, already part of Windows 10/11).
// The program itself does what a browser page cannot: keep the widget on top, turn the minimise button
// into "shrink to widget", start with Windows, remember its place, and open links in the normal browser.
package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"

	webview2 "github.com/jchv/go-webview2"
)

const (
	appTitle = "업무대시보드"
	appURL   = "https://sclee00.github.io/dept-dashboard/?app=1&host=win"
	version  = "1.2.0"
)

var (
	user32     = syscall.NewLazyDLL("user32.dll")
	kernel32   = syscall.NewLazyDLL("kernel32.dll")
	dwmapi     = syscall.NewLazyDLL("dwmapi.dll")
	shell32    = syscall.NewLazyDLL("shell32.dll")
	advapi32   = syscall.NewLazyDLL("advapi32.dll")
	pSetWinPos = user32.NewProc("SetWindowPos")
	pGetRect   = user32.NewProc("GetWindowRect")
	pShowWin   = user32.NewProc("ShowWindow")
	pIsZoomed  = user32.NewProc("IsZoomed")
	pIsIconic  = user32.NewProc("IsIconic")
	pSetFg     = user32.NewProc("SetForegroundWindow")
	pFindWin   = user32.NewProc("FindWindowW")
	pMsgBox    = user32.NewProc("MessageBoxW")
	pSetWLP    = user32.NewProc("SetWindowLongPtrW")
	pCallWP    = user32.NewProc("CallWindowProcW")
	pMutex     = kernel32.NewProc("CreateMutexW")
	pDwmSet    = dwmapi.NewProc("DwmSetWindowAttribute")
	pShellExec = shell32.NewProc("ShellExecuteW")
	pRegCreate = advapi32.NewProc("RegCreateKeyExW")
	pRegSet    = advapi32.NewProc("RegSetValueExW")
	pRegQuery  = advapi32.NewProc("RegQueryValueExW")
	pRegDel    = advapi32.NewProc("RegDeleteValueW")
	pRegClose  = advapi32.NewProc("RegCloseKey")
)

type rect struct{ L, T, R, B int32 }

// Bounds is what the page sees: position and size in screen pixels.
type Bounds struct {
	X   int  `json:"x"`
	Y   int  `json:"y"`
	W   int  `json:"w"`
	H   int  `json:"h"`
	Max bool `json:"max"`
	Min bool `json:"min"`
}

var (
	hwnd        uintptr
	wv          webview2.WebView
	oldProc     uintptr
	widgetOnMin bool
	onTop       bool
)

func u16(s string) *uint16 { p, _ := syscall.UTF16PtrFromString(s); return p }

func msg(text string) {
	pMsgBox.Call(0, uintptr(unsafe.Pointer(u16(text))), uintptr(unsafe.Pointer(u16(appTitle))), 0x40)
}

func openURL(url string) {
	pShellExec.Call(0, uintptr(unsafe.Pointer(u16("open"))), uintptr(unsafe.Pointer(u16(url))), 0, 0, 1)
}

func dataDir() string {
	base := os.Getenv("LOCALAPPDATA")
	if base == "" {
		base = os.TempDir()
	}
	d := filepath.Join(base, "업무대시보드")
	os.MkdirAll(d, 0755)
	return d
}

// ---- window placement ----
func getBounds() Bounds {
	var r rect
	pGetRect.Call(hwnd, uintptr(unsafe.Pointer(&r)))
	z, _, _ := pIsZoomed.Call(hwnd)
	ic, _, _ := pIsIconic.Call(hwnd)
	return Bounds{X: int(r.L), Y: int(r.T), W: int(r.R - r.L), H: int(r.B - r.T), Max: z != 0, Min: ic != 0}
}

func setBounds(x, y, w, h int) {
	if w < 200 || h < 150 {
		return
	}
	if z, _, _ := pIsZoomed.Call(hwnd); z != 0 {
		pShowWin.Call(hwnd, 9) // SW_RESTORE: a maximised window must be restored before it can be placed
	}
	const noZ, noActivate = 0x4, 0x10
	pSetWinPos.Call(hwnd, 0, uintptr(x), uintptr(y), uintptr(w), uintptr(h), noZ|noActivate)
}

func setTop(on bool) {
	after := ^uintptr(1) // HWND_NOTOPMOST
	if on {
		after = ^uintptr(0) // HWND_TOPMOST
	}
	onTop = on
	pSetWinPos.Call(hwnd, after, 0, 0, 0, 0, 0x1|0x2|0x10)
}

func lastFile() string { return filepath.Join(dataDir(), "window.json") }

func saveLast() {
	b := getBounds()
	if b.Min || b.W < 200 {
		return
	}
	j, _ := json.Marshal(b)
	os.WriteFile(lastFile(), j, 0644)
}

func loadLast() (Bounds, bool) {
	var b Bounds
	j, err := os.ReadFile(lastFile())
	if err != nil || json.Unmarshal(j, &b) != nil || b.W < 200 || b.H < 150 {
		return b, false
	}
	return b, true
}

// dark title bar in the dashboard's own colour
func darkTitle() {
	one := int32(1)
	pDwmSet.Call(hwnd, 20, uintptr(unsafe.Pointer(&one)), 4) // immersive dark mode
	cap := uint32(0x000B0806)                                // #06080B as COLORREF (BGR)
	pDwmSet.Call(hwnd, 35, uintptr(unsafe.Pointer(&cap)), 4) // caption colour (Windows 11)
	txt := uint32(0x00E6E6E6)
	pDwmSet.Call(hwnd, 36, uintptr(unsafe.Pointer(&txt)), 4) // caption text colour
}

// ---- start with Windows ----
const runKey = `Software\Microsoft\Windows\CurrentVersion\Run`

func runKeyOpen() (uintptr, bool) {
	var key uintptr
	r, _, _ := pRegCreate.Call(0x80000001, uintptr(unsafe.Pointer(u16(runKey))), 0, 0, 0, 0x0002|0x0001, 0, uintptr(unsafe.Pointer(&key)), 0)
	return key, r == 0
}

func autostart(set int) bool {
	key, ok := runKeyOpen()
	if !ok {
		return false
	}
	defer pRegClose.Call(key)
	name := u16(appTitle)
	switch set {
	case 1:
		exe, err := os.Executable()
		if err != nil {
			return false
		}
		v, _ := syscall.UTF16FromString(`"` + exe + `" --autostart`)
		pRegSet.Call(key, uintptr(unsafe.Pointer(name)), 0, 1, uintptr(unsafe.Pointer(&v[0])), uintptr(len(v)*2))
	case 0:
		pRegDel.Call(key, uintptr(unsafe.Pointer(name)))
	}
	r, _, _ := pRegQuery.Call(key, uintptr(unsafe.Pointer(name)), 0, 0, 0, 0)
	return r == 0
}

// ---- the minimise button can shrink to the widget instead ----
func wndProc(h, m, wp, lp uintptr) uintptr {
	const wmSysCommand, scMinimize, wmClose = 0x0112, 0xF020, 0x0010
	if m == wmSysCommand && wp&0xFFF0 == scMinimize && widgetOnMin {
		widgetOnMin = false
		wv.Eval(`window.__hostToMini && window.__hostToMini()`)
		return 0
	}
	if m == wmClose {
		// always ask before quitting
		r, _, _ := pMsgBox.Call(h, uintptr(unsafe.Pointer(u16("업무대시보드를 종료할까요?"))), uintptr(unsafe.Pointer(u16(appTitle))), 0x4|0x20) // MB_YESNO | MB_ICONQUESTION
		if r != 6 {                                                                                                                  // IDYES
			return 0
		}
		saveLast()
	}
	r, _, _ := pCallWP.Call(oldProc, h, m, wp, lp)
	return r
}

func main() {
	// one copy only: a second start brings the open window to the front
	if _, _, e := pMutex.Call(0, 0, uintptr(unsafe.Pointer(u16(`Local\DeptDashboardWindow`)))); e == syscall.Errno(183) {
		if h, _, _ := pFindWin.Call(0, uintptr(unsafe.Pointer(u16(appTitle)))); h != 0 {
			pShowWin.Call(h, 9)
			pSetFg.Call(h)
		}
		return
	}

	wv = webview2.NewWithOptions(webview2.WebViewOptions{
		Debug:     false,
		AutoFocus: true,
		DataPath:  filepath.Join(dataDir(), "WebView2"),
		WindowOptions: webview2.WindowOptions{
			Title:  appTitle,
			Width:  1440,
			Height: 900,
			IconId: 2,
			Center: true,
		},
	})
	if wv == nil {
		msg("Microsoft Edge WebView2 런타임이 없어 열 수 없습니다.\n확인을 누르면 설치 페이지가 열립니다. 설치한 뒤 다시 실행해 주세요.")
		openURL("https://go.microsoft.com/fwlink/p/?LinkId=2124703")
		return
	}
	defer wv.Destroy()
	hwnd = uintptr(wv.Window())
	darkTitle()
	if b, ok := loadLast(); ok {
		setBounds(b.X, b.Y, b.W, b.H)
		if b.Max {
			pShowWin.Call(hwnd, 3)
		}
	}
	oldProc, _, _ = pSetWLP.Call(hwnd, ^uintptr(3), syscall.NewCallback(wndProc)) // GWLP_WNDPROC = -4

	// what the page can ask the program to do
	wv.Bind("hostInfo", func() map[string]interface{} {
		return map[string]interface{}{"version": version, "top": onTop, "autostart": autostart(-1)}
	})
	wv.Bind("hostBounds", func() Bounds { return getBounds() })
	wv.Bind("hostSetBounds", func(x, y, w, h int) bool { setBounds(x, y, w, h); return true })
	wv.Bind("hostTop", func(on bool) bool { setTop(on); return onTop })
	wv.Bind("hostAutostart", func(set int) bool { return autostart(set) })
	wv.Bind("hostWidgetOnMin", func(on bool) bool { widgetOnMin = on; return on })
	wv.Bind("hostGemini", func(url string) bool { return strings.HasPrefix(url, "https://sclee00.github.io/") && askChrome(url) })
	wv.Bind("hostGemPlace", func(x, y, w, h int, show bool) bool { return gemPlace(x, y, w, h, show) })
	wv.Bind("hostGemAsk", func(id, prompt string, wantJSON bool, imagesJSON string) bool {
		return gemAsk(id, prompt, wantJSON, imagesJSON)
	})
	wv.Bind("hostGemNew", func() bool { return gemReload() })
	wv.Bind("hostMinimize", func() bool { pShowWin.Call(hwnd, 6); return true })
	wv.Bind("hostOpen", func(url string) bool {
		if len(url) > 8 && (url[:8] == "https://" || url[:7] == "http://" || url[:7] == "mailto:") {
			openURL(url)
			return true
		}
		return false
	})
	// links that would open a new window go to the normal browser instead
	wv.Init(`(() => {
  const ext = u => { try { const x = new URL(u, location.href); return x.protocol === 'mailto:' || x.origin !== location.origin || /\/(desktop|gemini-bridge)/.test(x.pathname); } catch { return false; } };
  const o = window.open;
  window.open = (u, t, f) => { if (u && ext(u) && window.hostOpen) { window.hostOpen(new URL(u, location.href).href); return null; } return o.call(window, u, t, f); };
  document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('a[href]'); if (!a) return;
    const href = a.getAttribute('href') || ''; if (!/^(https?:|mailto:)/i.test(href)) return;
    if ((a.target && a.target !== '_self') || ext(href)) { e.preventDefault(); window.hostOpen && window.hostOpen(a.href); } }, true);
})();`)
	wv.Navigate(appURL)
	wv.Run()
	saveLast()
}
