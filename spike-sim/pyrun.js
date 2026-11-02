/* Python 執行：用 Pyodide（瀏覽器內的 CPython）執行，提供 SPIKE App 3 的 API 子集 */
(function (SP) {
  'use strict';
  const VER = '0.26.4';
  const BASE = (window.SP_PYODIDE_BASE || 'https://cdn.jsdelivr.net/pyodide/v' + VER + '/full/');

  const PRELUDE = `
import sys, types, asyncio
import _sp

def _mod(name, **attrs):
    m = types.ModuleType(name)
    m.__dict__.update(attrs)
    sys.modules[name] = m
    return m

def _pn(p):
    if not isinstance(p, int) or isinstance(p, bool) or p < 0 or p > 5:
        raise ValueError("無效的埠 %r（請用 port.A ～ port.F）" % (p,))
    return "ABCDEF"[p]

def _need_ab(p):
    if p not in (0, 1):
        raise ValueError("埠 %s 不是馬達（模擬器：A＝左輪、B＝右輪）" % _pn(p))
    return _pn(p)

class _Port:
    A, B, C, D, E, F = 0, 1, 2, 3, 4, 5
port = _Port()

class _LightMatrix:
    IMAGE_HEART = "heart"; IMAGE_HAPPY = "smile"; IMAGE_SMILE = "smile"; IMAGE_SAD = "sad"
    IMAGE_ARROW_N = "up"; IMAGE_YES = "check"; IMAGE_NO = "cross"
    def show_image(self, image):
        if image not in ("heart", "smile", "sad", "up", "check", "cross"):
            raise ValueError("模擬器尚未支援這個圖案：%r" % (image,))
        _sp.lightPattern(image)
    async def write(self, text, intensity=100, time_per_character=500):
        _sp.lightText(str(text))
        await _sp.wait(len(str(text)) * time_per_character / 1000)
    def clear(self):
        _sp.lightOff()
    def set_pixel(self, x, y, intensity=100):
        if not (0 <= x <= 4 and 0 <= y <= 4):
            raise ValueError("燈的位置 x、y 要在 0～4 之間")
        _sp.lightPixel(x + 1, y + 1, intensity)
light_matrix = _LightMatrix()

class _Motion:
    def tilt_angles(self):
        return (_sp.yawDeci(), 0, 0)
    def reset_yaw(self, angle=0):
        _sp.resetYaw()
motion_sensor = _Motion()

class _Sound:
    async def beep(self, frequency=440, duration=500, volume=100, **kw):
        await _sp.beepHz(frequency, duration / 1000)
sound = _Sound()

class _Hub:
    pass
_hub = _mod("hub", port=port, light_matrix=light_matrix, motion_sensor=motion_sensor, sound=sound)

_q = []
async def _wrap(c):
    try:
        await c
    except SystemExit:
        _sp.stopSim()
class _Runloop:
    def run(self, *coros):
        for c in coros:
            _q.append(_wrap(c))
    async def sleep_ms(self, ms):
        await _sp.wait(ms / 1000)
    async def until(self, function, timeout=0):
        await _sp.until(function)
    async def _drain(self):
        if _q:
            await asyncio.gather(*list(_q))
runloop = _Runloop()
_mod("runloop", run=runloop.run, sleep_ms=runloop.sleep_ms, until=runloop.until, _drain=runloop._drain, _q=_q)

class _MotorPair:
    PAIR_1 = 1; PAIR_2 = 2; PAIR_3 = 3
    BRAKE = 1; COAST = 0; HOLD = 2; SMART_BRAKE = 5
    _ok = False
    def pair(self, pair, left, right):
        if (left, right) != (0, 1):
            raise ValueError("模擬器目前只支援 motor_pair.pair(..., port.A, port.B)（A＝左輪、B＝右輪）")
        self._ok = True
    def _chk(self):
        if not self._ok:
            raise RuntimeError("請先用 motor_pair.pair(motor_pair.PAIR_1, port.A, port.B) 設定馬達組")
    def move(self, pair, steering, *, velocity=360, acceleration=1000):
        self._chk(); _sp.mpMove(steering, velocity)
    async def move_for_degrees(self, pair, degrees, steering, *, velocity=360, stop=1, acceleration=1000, deceleration=1000):
        self._chk(); await _sp.mpMoveDeg(degrees, steering, velocity)
    async def move_for_time(self, pair, duration, steering, *, velocity=360, stop=1, acceleration=1000, deceleration=1000):
        self._chk(); await _sp.mpMoveTime(duration, steering, velocity)
    def move_tank(self, pair, left_velocity, right_velocity, *, acceleration=1000):
        self._chk(); _sp.mpTank(left_velocity, right_velocity)
    def stop(self, pair, *, stop=1):
        _sp.mpStop()
motor_pair = _MotorPair()
_mod("motor_pair", **{k: getattr(motor_pair, k) for k in dir(motor_pair) if not k.startswith("__")})

class _Motor:
    BRAKE = 1; COAST = 0; HOLD = 2; SMART_BRAKE = 5
    def run(self, p, velocity, *, acceleration=1000):
        _sp.motorRun(_need_ab(p), velocity)
    async def run_for_degrees(self, p, degrees, velocity, *, stop=1, acceleration=1000, deceleration=1000):
        await _sp.motorDeg(_need_ab(p), degrees, velocity)
    def stop(self, p, *, stop=1):
        _sp.motorStop(_need_ab(p))
    def relative_position(self, p):
        return _sp.motorPos(_need_ab(p))
    def reset_relative_position(self, p, position=0):
        _sp.motorSetPos(_need_ab(p), position)
motor = _Motor()
_mod("motor", **{k: getattr(motor, k) for k in dir(motor) if not k.startswith("__")})

_COL = {"black": 0, "blue": 3, "green": 6, "yellow": 7, "red": 9, "white": 10, "none": -1}
_mod("color", BLACK=0, MAGENTA=1, PURPLE=2, BLUE=3, AZURE=4, TURQUOISE=5, GREEN=6, YELLOW=7, ORANGE=8, RED=9, WHITE=10, UNKNOWN=-1)
class _ColorSensor:
    def color(self, p):
        return _COL[_sp.colorKey(_pn(p))]
    def reflection(self, p):
        return _sp.light(_pn(p))
color_sensor = _ColorSensor()
_mod("color_sensor", color=color_sensor.color, reflection=color_sensor.reflection)

class _Dist:
    def distance(self, p):
        return _sp.distMm(_pn(p))
distance_sensor = _Dist()
_mod("distance_sensor", distance=distance_sensor.distance)

class _Force:
    def pressed(self, p):
        return bool(_sp.pressed(_pn(p)))
    def force(self, p):
        return 80 if _sp.pressed(_pn(p)) else 0
force_sensor = _Force()
_mod("force_sensor", pressed=force_sensor.pressed, force=force_sensor.force)

import time as _time
_time.ticks_ms = _sp.ticksMs
`;

  const ZH = [
    [/^NameError: name '(.+)' is not defined/, "名稱「$1」還沒有定義（拼錯字？還是忘了 import？）"],
    [/^SyntaxError: (.*)/, "語法錯誤：$1"],
    [/^IndentationError: (.*)/, "縮排錯誤：$1（同一層的程式要對齊）"],
    [/^TabError: (.*)/, "縮排錯誤：$1"],
    [/^ModuleNotFoundError: No module named '(.+)'/, "找不到模組「$1」（模擬器只支援 SPIKE 的 hub、motor、motor_pair、color_sensor… 等）"],
    [/^ImportError: cannot import name '(.+)' from '(.+)'/, "模組「$2」裡沒有「$1」"],
    [/^AttributeError: (.*)/, "沒有這個屬性或函式：$1（模擬器可能尚未支援）"],
    [/^TypeError: (.*)/, "型別或參數錯誤：$1"],
    [/^ValueError: (.*)/, "數值錯誤：$1"],
    [/^ZeroDivisionError: (.*)/, "不能除以 0"],
    [/^UnboundLocalError: (.*)/, "變數在指定值之前就被使用了：$1"],
    [/^RuntimeError: (.*)/, "$1"],
    [/^KeyError: (.*)/, "找不到鍵 $1"],
    [/^IndexError: (.*)/, "索引超出範圍：$1"],
  ];
  function translate(last) {
    for (const [re, to] of ZH) if (re.test(last)) return last.replace(re, to);
    return last;
  }

  let pyodide = null, loading = null, stopped = false;
  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('無法載入 Pyodide（需要網路）：' + src)); document.head.appendChild(s); });
  }
  async function ensure(onStatus) {
    if (pyodide) return pyodide;
    if (!loading) loading = (async () => {
      if (onStatus) onStatus('正在載入 Python 執行環境（第一次約 10 MB）…');
      if (!window.loadPyodide) await loadScript(BASE + 'pyodide.js');
      pyodide = await window.loadPyodide({ indexURL: BASE });
      if (onStatus) onStatus('');
      return pyodide;
    })();
    return loading;
  }

  function install(api, sim, io) {
    const pct = (v) => (Number(v) || 0) / 10;
    const m = {
      lightPattern: (n) => api.lightPattern(n), lightText: (t) => api.lightText(t), lightOff: () => api.lightOff(),
      lightPixel: (x, y, b) => api.lightPixel(x, y, b),
      wait: (s) => api.wait(s), until: (fn) => api.waitUntil(() => !!fn()),
      yawDeci: () => api.yaw() * 10, resetYaw: () => api.resetYaw(), ticksMs: () => api.ticksMs(),
      beepHz: (f, s) => api.beepHz(f, s),
      mpMove: (st, v) => api.steer(pct(v), st), mpStop: () => api.stop(), mpTank: (l, r) => api.tank(pct(l), pct(r)),
      mpMoveDeg: (d, st, v) => api.moveDegrees(d, st, pct(v)), mpMoveTime: (ms, st, v) => api.moveTime(ms, st, pct(v)),
      motorRun: (p, v) => api.motorStart(p, pct(v)), motorDeg: (p, d, v) => api.motorTurnAt(p, d, pct(v)),
      motorStop: (p) => api.motorStop(p), motorPos: (p) => api.motorPos(p), motorSetPos: (p, v) => api.motorSetPos(p, v),
      colorKey: (p) => api.colorKey(p), light: (p) => api.light(p), distMm: (p) => api.distMm(p), pressed: (p) => api.pressed(p),
      stopSim: () => { stopped = true; api.stopSim(); },
    };
    pyodide.registerJsModule('_sp', m);
    pyodide.runPython(PRELUDE, { filename: '<sim>' });
    pyodide.setStdout({ batched: (s) => io.say(s) });
    pyodide.setStderr({ batched: (s) => io.say(s) });
  }

  // 回傳 { line, message, raw }
  function parseError(e) {
    const raw = String(e && e.message ? e.message : e);
    const lines = raw.trim().split('\n');
    const last = lines[lines.length - 1];
    let line = null;
    for (const l of lines) { const mt = l.match(/File "<exec>", line (\d+)/); if (mt) line = Number(mt[1]); }
    if (line === null) { const mt = raw.match(/\(<exec>, line (\d+)\)/); if (mt) line = Number(mt[1]); }
    let msg = last;
    if (/^(pyodide\.ffi\.)?JsException:/.test(last)) msg = last.replace(/^(pyodide\.ffi\.)?JsException:\s*(Error:\s*)?/, '');
    else msg = translate(last);
    return { line, message: msg, raw };
  }

  let installed = false;
  SP.py = {
    ensure,
    isLoaded: () => !!pyodide,
    async run(code, api, sim, io) {
      await ensure(io.status);
      if (!installed) { install(api, sim, io); installed = true; }
      stopped = false; sim._pyStopped = false;
      pyodide.runPython('_q.clear()');
      const g = pyodide.globals.get('dict')();
      try {
        await pyodide.runPythonAsync(code, { globals: g, filename: '<exec>' });
        await pyodide.runPythonAsync('await runloop._drain()');
      } catch (e) {
        if (stopped || e === SP.STOP) return { stopped: true };
        if (/Stop/.test(String(e && e.message)) && sim._userStopped) return { stopped: true };
        return { error: parseError(e) };
      } finally { g.destroy(); }
      return { ok: true };
    },
    stop() { stopped = true; },
    parseError,
  };
})(window.SP = window.SP || {});
