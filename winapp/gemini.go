package main

// Gemini web through Chrome: the Chrome extension cannot live inside this program, so a small page is opened
// in the user's own Chrome (where the extension and the Google sign-in are). That page closes itself when done;
// if Chrome keeps it open, the program closes any window titled "업무대시보드 AI 완료".

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	"unsafe"
)

var (
	pEnumWindows    = user32.NewProc("EnumWindows")
	pGetWindowTextW = user32.NewProc("GetWindowTextW")
	pPostMessageW   = user32.NewProc("PostMessageW")
	pSysParamInfo   = user32.NewProc("SystemParametersInfoW")
	doneWins        []uintptr
	enumDone        = syscall.NewCallback(func(h uintptr, _ uintptr) uintptr {
		buf := make([]uint16, 256)
		n, _, _ := pGetWindowTextW.Call(h, uintptr(unsafe.Pointer(&buf[0])), 256)
		if n > 0 && strings.Contains(syscall.UTF16ToString(buf[:n]), "업무대시보드 AI 완료") {
			doneWins = append(doneWins, h)
		}
		return 1
	})
)

func chromePath() string {
	for _, base := range []string{os.Getenv("ProgramFiles"), os.Getenv("ProgramFiles(x86)"), os.Getenv("LOCALAPPDATA")} {
		if base == "" {
			continue
		}
		p := filepath.Join(base, `Google\Chrome\Application\chrome.exe`)
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return ""
}

func askChrome(url string) bool {
	c := chromePath()
	if c == "" {
		return false
	}
	var wa rect
	pSysParamInfo.Call(0x0030, 0, uintptr(unsafe.Pointer(&wa)), 0) // SPI_GETWORKAREA
	w, h := 420, 230
	x, y := int(wa.R)-w-24, int(wa.B)-h-24
	cmd := exec.Command(c, "--app="+url, "--window-size=420,230", "--window-position="+itoa(x)+","+itoa(y))
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	if cmd.Start() != nil {
		return false
	}
	go func() {
		for i := 0; i < 600; i++ { // up to ten minutes
			time.Sleep(time.Second)
			doneWins = nil
			pEnumWindows.Call(enumDone, 0)
			for _, h := range doneWins {
				time.Sleep(1500 * time.Millisecond)
				pPostMessageW.Call(h, 0x0010, 0, 0) // WM_CLOSE
			}
			if len(doneWins) > 0 {
				return
			}
		}
	}()
	return true
}

func itoa(n int) string {
	neg := n < 0
	if neg {
		n = -n
	}
	b := []byte{}
	for {
		b = append([]byte{byte('0' + n%10)}, b...)
		n /= 10
		if n == 0 {
			break
		}
	}
	if neg {
		b = append([]byte{'-'}, b...)
	}
	return string(b)
}
