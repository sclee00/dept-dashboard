package main

// Stays in the background while the dashboard window is open and keeps the widget on top:
// the page marks its title with 📌 when it wants to stay above other windows.
// After changing the window it nudges the size by one pixel, so the page knows the helper is there.

import (
	"strings"
	"syscall"
	"time"
	"unsafe"
)

var (
	user32           = syscall.NewLazyDLL("user32.dll")
	kernel32         = syscall.NewLazyDLL("kernel32.dll")
	pEnumWindows     = user32.NewProc("EnumWindows")
	pGetWindowTextW  = user32.NewProc("GetWindowTextW")
	pIsWindowVisible = user32.NewProc("IsWindowVisible")
	pSetWindowPos    = user32.NewProc("SetWindowPos")
	pGetWindowRect   = user32.NewProc("GetWindowRect")
	pCreateMutexW    = kernel32.NewProc("CreateMutexW")
)

type rect struct{ L, T, R, B int32 }

const (
	appTitle = "업무대시보드"
	pinMark  = "📌"
)

func windowsWithTitle() map[uintptr]string {
	out := map[uintptr]string{}
	cb := syscall.NewCallback(func(h uintptr, _ uintptr) uintptr {
		if v, _, _ := pIsWindowVisible.Call(h); v == 0 {
			return 1
		}
		buf := make([]uint16, 512)
		n, _, _ := pGetWindowTextW.Call(h, uintptr(unsafe.Pointer(&buf[0])), 512)
		if n > 0 {
			t := syscall.UTF16ToString(buf[:n])
			if strings.Contains(t, appTitle) {
				out[h] = t
			}
		}
		return 1
	})
	pEnumWindows.Call(cb, 0)
	return out
}

func setTop(h uintptr, on bool) {
	after := ^uintptr(1) // HWND_NOTOPMOST (-2)
	if on {
		after = ^uintptr(0) // HWND_TOPMOST (-1)
	}
	const noMove, noSize, noActivate = 0x2, 0x1, 0x10
	pSetWindowPos.Call(h, after, 0, 0, 0, 0, noMove|noSize|noActivate)
	// one-pixel nudge and back: the page sees two resize events = the helper is running
	var r rect
	pGetWindowRect.Call(h, uintptr(unsafe.Pointer(&r)))
	w, ht := r.R-r.L, r.B-r.T
	pSetWindowPos.Call(h, 0, 0, 0, uintptr(w+1), uintptr(ht), noMove|noActivate|0x4)
	time.Sleep(60 * time.Millisecond)
	pSetWindowPos.Call(h, 0, 0, 0, uintptr(w), uintptr(ht), noMove|noActivate|0x4)
}

func watch() {
	name, _ := syscall.UTF16PtrFromString("Local\\DeptDashboardPinHelper")
	if _, _, e := pCreateMutexW.Call(0, 0, uintptr(unsafe.Pointer(name))); e == syscall.Errno(183) { // ERROR_ALREADY_EXISTS: another helper is running
		return
	}
	state := map[uintptr]bool{}
	start, lastSeen := time.Now(), time.Now()
	for {
		ws := windowsWithTitle()
		if len(ws) > 0 {
			lastSeen = time.Now()
		}
		for h, t := range ws {
			want := strings.Contains(t, pinMark)
			if was, ok := state[h]; !ok && !want {
				state[h] = false
			} else if !ok || was != want {
				setTop(h, want)
				state[h] = want
			}
		}
		for h := range state {
			if _, ok := ws[h]; !ok {
				delete(state, h)
			}
		}
		// quit once the dashboard has been closed for a while (give it a minute to open first)
		if time.Since(start) > 90*time.Second && time.Since(lastSeen) > 30*time.Second {
			return
		}
		time.Sleep(400 * time.Millisecond)
	}
}
