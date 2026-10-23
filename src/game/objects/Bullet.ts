import Phaser from "phaser";
export class Bullet extends Phaser.Physics.Arcade.Image {
  private lifespan: number = 0;
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, "bullet");
  }
  public fire(x: number, y: number, angle: number) {
    this.body?.reset(x, y); // Полностью сбрасывает физическое тело и старые скорости

    this.setActive(true);
    this.setVisible(true);
    this.setRotation(angle);

    const directionX = Math.sin(angle);
    const directionY = -Math.cos(angle);
    const bulletSpeed = 500;

    this.setVelocity(directionX * bulletSpeed, directionY * bulletSpeed);

    // Задаем время жизни в миллисекундах (1.5 секунды)
    this.lifespan = 1500;
  }

  // Вызывается автоматически, если группа снарядов обновляется в update сцены
  update(time: number, delta: number) {
    if (!this.active) return;

    this.lifespan -= delta;
    if (this.lifespan <= 0) {
      this.kill();
    }
  }

  public kill() {
    this.setActive(false);
    this.setVisible(false);
    this.setVelocity(0, 0);
  }
}
