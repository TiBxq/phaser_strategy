import * as Phaser from 'phaser';

/**
 * Collapse dust + debris chips played when a structure is destroyed.
 * Shared by building demolition (BuildingRenderer) and the bandit camp (BanditRenderer).
 */
export function spawnDemolitionEffect(scene, x, y, baseDepth) {
    const depth = baseDepth + 10;

    // Collapse dust — grayer than construction, wider spread, lingers longer
    const demoShared = {
        speed:    { min: 18, max: 50 },
        gravityY: -6,
        alpha:    { start: 0.88, end: 0, ease: 'quad.in' },
        tint:     [0xb0a898, 0xa09888, 0xc0b8a8, 0xd0c8b8],
    };

    const demoL = scene.add.particles(x - 36, y - 10, 'particle-dust', {
        ...demoShared,
        angle:    { min: 220, max: 265 },
        scale:    { start: 1.0, end: 2.4, ease: 'sine.out' },
        lifespan: { min: 650, max: 1000 },
        quantity: 5, stopAfter: 5,
    });
    demoL.setDepth(depth);

    const demoR = scene.add.particles(x + 30, y - 10, 'particle-dust', {
        ...demoShared,
        angle:    { min: 275, max: 320 },
        scale:    { start: 1.0, end: 2.4, ease: 'sine.out' },
        lifespan: { min: 650, max: 1000 },
        delay:    { min: 30, max: 70 },
        quantity: 5, stopAfter: 5,
    });
    demoR.setDepth(depth);

    const demoC1 = scene.add.particles(x - 10, y - 26, 'particle-dust', {
        ...demoShared,
        angle:    { min: 253, max: 278 },
        scale:    { start: 1.1, end: 2.8, ease: 'sine.out' },
        lifespan: { min: 800, max: 1300 },
        delay:    { min: 20, max: 60 },
        quantity: 6, stopAfter: 6,
    });
    demoC1.setDepth(depth);

    const demoC2 = scene.add.particles(x + 12, y - 30, 'particle-dust', {
        ...demoShared,
        angle:    { min: 258, max: 282 },
        scale:    { start: 1.1, end: 2.6, ease: 'sine.out' },
        lifespan: { min: 750, max: 1200 },
        delay:    { min: 60, max: 130 },
        quantity: 5, stopAfter: 5,
    });
    demoC2.setDepth(depth);

    scene.time.delayedCall(1600, () => {
        demoL.destroy(); demoR.destroy(); demoC1.destroy(); demoC2.destroy();
    });

    // Debris chips — collapse flies in all directions, not just upward
    const demoChips = scene.add.particles(x, y - 20, 'particle-chip', {
        emitZone: { type: 'random', source: new Phaser.Geom.Circle(0, 0, 22) },
        angle:    { min: 160, max: 380 },
        speed:    { min: 110, max: 240 },
        gravityY: 460,
        scaleX:   { start: 1.6, end: 0.2 },
        scaleY:   { start: 0.8, end: 0.2 },
        alpha:    { start: 1.0, end: 0 },
        rotate:   { min: 0, max: 360 },
        lifespan: { min: 320, max: 580 },
        tint:     [0x6a5a48, 0x7a6a55, 0x58483a, 0x888070, 0x4a3c2e],
        quantity: 36,
        stopAfter: 36,
    });
    demoChips.setDepth(depth);
    scene.time.delayedCall(750, () => demoChips.destroy());
}
