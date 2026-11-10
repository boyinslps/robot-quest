/* 連續捲動的積木抽屜（像 SPIKE／Scratch）：所有類別接成一條清單，每段有標題。
   點左邊的類別會捲到那一段；往下捲會自動換到下一個類別；抽屜常駐不會自己收起來。 */
(function (SP) {
  'use strict';
  const NAME = 'spike-toolbox';

  class SpikeToolbox extends Blockly.Toolbox {
    init() {
      super.init();
      this.flyout.autoClose = false;      // 拖出積木後抽屜不收起來
      this._shown = false; this._labels = [];
      const tick = () => { this._sync(); requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }

    _categories() { return this.getToolboxItems().filter((i) => typeof i.getContents === 'function'); }

    // 把每個類別的內容（含「變數」「我的積木」這種動態類別）接成一條
    _allContents() {
      const out = [];
      for (const cat of this._categories()) {
        let c = cat.getContents();
        if (typeof c === 'string') {          // 動態類別：交給註冊的函式產生
          const fn = this.workspace_.getToolboxCategoryCallback(c);
          c = fn ? Blockly.utils.toolbox.convertFlyoutDefToJsonArray(fn(this.workspace_)) : [];
        }
        const cls = 'cat-label cat-label-' + String(cat.getName());
        out.push({ kind: 'label', text: cat.getName(), 'web-class': cls });
        out.push(...c);
        out.push({ kind: 'sep', gap: 24 });
      }
      out.push({ kind: 'sep', gap: 600 }, { kind: 'label', text: ' ' });   // 最後留白，讓最後的類別也能捲到上面
      return out;
    }

    showAll(keepScroll) {
      const ws = this.flyout.getWorkspace();
      let keep = 0;
      if (keepScroll && this._shown && ws.scrollbar) { const m = ws.getMetricsManager(); keep = m.getViewMetrics().top - m.getScrollMetrics().top; }
      this.flyout.show(this._allContents());
      this._shown = true; this._indexLabels();
      if (keepScroll && ws.scrollbar) ws.scrollbar.setY(keep);
    }

    _indexLabels() {
      this._labels = [];
      for (const it of this.flyout.getContents()) {
        const el = it.button;                      // flyout 內容是 {type:'button', button} 或 {type:'block', block}
        if (el && typeof el.isLabel === 'function' && el.isLabel()) this._labels.push({ text: el.getButtonText(), btn: el, get y() { return this.btn.getPosition().y * this.ws.scale; }, ws: this.flyout.getWorkspace() });
      }
    }

    _labelY(cat) { const l = this._labels.find((x) => x.text === cat.getName()); return l ? l.y : null; }

    scrollToCategory(cat) {
      const ws = this.flyout.getWorkspace(), y = this._labelY(cat);
      if (y === null || !ws.scrollbar) return;
      const go = () => {
        const yy = this._labelY(cat); if (yy === null) return;
        ws.scrollbar.setY(yy - ws.getMetricsManager().getScrollMetrics().top - 6);
        this._pin = { cat, top: ws.getMetricsManager().getViewMetrics().top };   // 內容太短捲不到最上面時，維持剛點的類別，直到使用者再捲動
      };
      go();
      // 積木還在排版時位置會再變，等一下再校正一次
      const my = this._scrollToken = (this._scrollToken || 0) + 1;
      for (const ms of [120, 400]) setTimeout(() => { if (this._scrollToken === my && this._pin && this._pin.cat === cat) go(); }, ms);
    }

    _silentSelect(cat) {
      const old = this.selectedItem_;
      if (old === cat) return;
      if (old) old.setSelected(false);
      cat.setSelected(true); this.selectedItem_ = cat;
    }

    // 點類別 → 捲到那一段（不是收起或換成只有那個類別）
    setSelectedItem(cat) {
      if (!cat || typeof cat.getContents !== 'function') return;
      if (!this._shown) this.showAll(false);
      this._silentSelect(cat); this.scrollToCategory(cat);
    }
    updateFlyout_() { /* 由 showAll 管理 */ }
    refreshSelection() { if (this._shown) this.showAll(true); }

    // 往下捲時，依最上面看得到的標題換類別
    _sync() {
      if (!this._shown || !this._labels.length) return;
      const ws = this.flyout.getWorkspace(); if (!ws.scrollbar) return;
      const m = ws.getMetricsManager(), top = m.getViewMetrics().top - m.getScrollMetrics().top + m.getScrollMetrics().top;
      if (this._pin) { if (Math.abs(m.getViewMetrics().top - this._pin.top) < 3) return; this._pin = null; }
      const vm = m.getViewMetrics(), sm = m.getScrollMetrics();
      const atBottom = vm.top + vm.height >= sm.top + sm.height - 2;     // 捲到底：選最後一個看得到的類別
      let cur = null;
      for (const l of this._labels) if (l.text.trim() && (atBottom ? l.y <= vm.top + vm.height - 80 : l.y <= top + 40)) cur = l; else if (!atBottom) break;
      if (!cur) cur = this._labels[0];
      const cat = this._categories().find((c) => c.getName() === cur.text);
      if (cat && this.selectedItem_ !== cat) this._silentSelect(cat);
    }
  }

  try { Blockly.registry.register(Blockly.registry.Type.TOOLBOX, NAME, SpikeToolbox, true); SP.toolboxPlugin = NAME; }
  catch (e) { SP.toolboxPlugin = null; }
})(window.SP = window.SP || {});
