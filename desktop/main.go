// 업무대시보드 · Windows 실행 파일
// Opens the dashboard as its own app window (no tabs, no address bar) in the Chrome
// or Edge that is already on this PC, so Google sign-in and the Gemini bridge
// extension keep working exactly as in the browser.
package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"unsafe"
)

const appURL = "https://sclee00.github.io/dept-dashboard/?app=1"

func candidates() []string {
	pf, pf86, local := os.Getenv("ProgramFiles"), os.Getenv("ProgramFiles(x86)"), os.Getenv("LOCALAPPDATA")
	var out []string
	for _, base := range []string{pf, pf86, local} {
		if base != "" {
			out = append(out, filepath.Join(base, `Google\Chrome\Application\chrome.exe`))
		}
	}
	for _, base := range []string{pf86, pf, local} {
		if base != "" {
			out = append(out, filepath.Join(base, `Microsoft\Edge\Application\msedge.exe`))
		}
	}
	return out
}

// the dashboard installed as an app (Chrome/Edge "설치") can hide its title bar, so prefer its own shortcut
func installedShortcut() string {
	appdata, profile := os.Getenv("APPDATA"), os.Getenv("USERPROFILE")
	var roots []string
	if appdata != "" {
		roots = append(roots, filepath.Join(appdata, `Microsoft\Windows\Start Menu\Programs`))
	}
	if profile != "" {
		roots = append(roots, filepath.Join(profile, "Desktop"), filepath.Join(profile, "OneDrive", "Desktop"), filepath.Join(profile, "OneDrive", "바탕 화면"))
	}
	for _, r := range roots {
		for _, pat := range []string{"업무대시보드.lnk", "*\\업무대시보드.lnk", "업무 대시보드.lnk", "*\\업무 대시보드.lnk"} {
			if m, _ := filepath.Glob(filepath.Join(r, pat)); len(m) > 0 {
				return m[0]
			}
		}
	}
	return ""
}

func msgBox(text, title string) {
	u := syscall.NewLazyDLL("user32.dll").NewProc("MessageBoxW")
	t, _ := syscall.UTF16PtrFromString(text)
	c, _ := syscall.UTF16PtrFromString(title)
	u.Call(0, uintptr(unsafe.Pointer(t)), uintptr(unsafe.Pointer(c)), 0x40)
}

func main() {
	url := appURL
	if len(os.Args) > 1 && len(os.Args[1]) > 8 && os.Args[1][:8] == "https://" {
		url = os.Args[1] // optional: another address as the first argument
	}
	if len(os.Args) < 2 {
		if lnk := installedShortcut(); lnk != "" {
			cmd := exec.Command("explorer.exe", lnk)
			if cmd.Start() == nil {
				watch()
				return
			}
		}
	}
	for _, b := range candidates() {
		if _, err := os.Stat(b); err == nil {
			cmd := exec.Command(b, "--app="+url) // the page itself restores the last size and position
			cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
			if cmd.Start() == nil {
				watch()
				return
			}
		}
	}
	// no Chrome / Edge found: open in the default browser instead
	exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
	msgBox("Chrome이나 Edge를 찾지 못해 기본 브라우저로 열었습니다.\nGemini 연동은 Chrome(확장 설치)에서 가장 잘 됩니다.", "업무대시보드")
}
