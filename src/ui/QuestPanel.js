import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';

const PANEL_X    = 10;
const PANEL_Y    = 48;
const PANEL_W    = 195;
const PAD_X      = 10;
const PAD_Y      = 8;
const LINE_H     = 18;
const BORDER     = 2;
const DEPTH_BG   = 1001;
const DEPTH_TEXT = 1002;

const STYLE_TITLE = {
    fontFamily: 'monospace',
    fontSize:   '13px',
    fontStyle:  'bold',
    color:      '#ffffff',
    wordWrap:   { width: PANEL_W - PAD_X * 2 },
};

const STYLE_TASK_DONE = {
    fontFamily: 'monospace',
    fontSize:   '12px',
    color:      '#44dd44',
    wordWrap:   { width: PANEL_W - PAD_X * 2 },
};

const STYLE_TASK_PENDING = {
    fontFamily: 'monospace',
    fontSize:   '12px',
    color:      '#aaaaaa',
    wordWrap:   { width: PANEL_W - PAD_X * 2 },
};

const STYLE_COMPLETE = {
    fontFamily: 'monospace',
    fontSize:   '13px',
    fontStyle:  'bold',
    color:      '#ffd700',
    wordWrap:   { width: PANEL_W - PAD_X * 2 },
};

const STYLE_SUBTITLE = {
    fontFamily: 'monospace',
    fontSize:   '12px',
    color:      '#ccaa44',
    wordWrap:   { width: PANEL_W - PAD_X * 2 },
};

export class QuestPanel {
    /**
     * @param {Phaser.Scene} scene
     * @param {import('../systems/QuestSystem.js').QuestSystem} questSystem
     */
    constructor(scene, questSystem) {
        this._scene       = scene;
        this._questSystem = questSystem;
        this._texts       = [];

        this._bg = scene.add.graphics()
            .setScrollFactor(0)
            .setDepth(DEPTH_BG);

        GameEvents.on(EventNames.QUEST_STARTED,        () => this._redraw());
        GameEvents.on(EventNames.QUEST_TASK_COMPLETED, () => this._redraw());
        GameEvents.on(EventNames.QUEST_COMPLETED,      () => this._redraw());
        GameEvents.on(EventNames.RESOURCES_CHANGED,    () => this._redraw());
        GameEvents.on(EventNames.VILLAGERS_CHANGED,    () => this._redraw());

        this._redraw();
    }

    // ─── Internal ──────────────────────────────────────────────────────────────

    _clearTexts() {
        for (const t of this._texts) t.destroy();
        this._texts = [];
    }

    _addText(x, y, label, style) {
        const t = this._scene.add.text(x, y, label, style)
            .setScrollFactor(0)
            .setDepth(DEPTH_TEXT);
        this._texts.push(t);
        return t;
    }

    _redraw() {
        this._clearTexts();
        this._bg.clear();

        const x0    = PANEL_X + PAD_X;
        let   curY  = PANEL_Y + PAD_Y;

        if (this._questSystem.isComplete()) {
            // ── Terminal state ──
            this._addText(x0, curY, 'Enjoy the Game!', STYLE_COMPLETE);
            curY += LINE_H + 2;
            this._addText(x0, curY, 'All quests complete!', STYLE_SUBTITLE);
            curY += LINE_H;
        } else {
            // ── Active quest ──
            const quest = this._questSystem.currentQuest;

            this._addText(x0, curY, quest.label, STYLE_TITLE);
            curY += LINE_H + 4;

            for (const task of quest.tasks) {
                const done  = this._questSystem.isTaskDone(task.id);
                const prog  = !done ? this._questSystem.getTaskProgress(task.id) : null;
                const label = (done ? '\u2713 ' : '\u25cb ') + task.label
                            + (prog ? ` (${prog.current}/${prog.target})` : '');
                const style = done ? STYLE_TASK_DONE : STYLE_TASK_PENDING;
                const t     = this._addText(x0, curY, label, style);
                curY += Math.max(t.height, LINE_H) + 2;
            }
        }

        const panelH = curY - PANEL_Y + PAD_Y;

        this._bg
            .fillStyle(0x222222, 0.15)
            .fillRoundedRect(
                PANEL_X - BORDER,
                PANEL_Y - BORDER,
                PANEL_W + BORDER * 2,
                panelH + BORDER * 2,
                5,
            )
            .fillStyle(0x111111, 0.72)
            .fillRoundedRect(PANEL_X, PANEL_Y, PANEL_W, panelH, 4);
    }
}
