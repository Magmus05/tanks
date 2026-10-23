import Phaser from "phaser";

export class RemotePlayer extends Phaser.Physics.Arcade.Sprite {
  public id: string;
  private nameText: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    id: string,
    name: string,
  ) {
    super(scene, x, y, "tank");

    this.id = id;
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setScale(0.35);
    this.setCollideWorldBounds(true);
    this.setDepth(2);

    // Подкрашиваем чужие сетевые танки в сине-голубой цвет, чтобы отличать от ботов и себя
    this.setTint(0x3498db);
    this.setBodySize(60, 60, true);

    // Имя игрока над танком
    this.nameText = scene.add
      .text(x, y - 40, name, {
        fontSize: "16px",
        color: "#5574ff",
        fontStyle: "bold",
        backgroundColor: "rgba(252, 248, 248, 1)",
      })
      .setOrigin(0.5)
      .setDepth(10);
  }

  // Сюда мы будем передавать новые координаты из сокетов
  public updateNetworkPosition(x: number, y: number, rotation: number) {
    this.setPosition(x, y);
    this.setRotation(rotation);

    if (this.nameText && this.active) {
      this.nameText.setPosition(this.x, this.y - 40);
    }
  }

  public playDamageEffect() {
    this.scene.tweens.add({
      targets: this,
      alpha: 0.1,
      duration: 30,
      yoyo: true,
      repeat: 2,
    });
  }

  public destroyPlayer() {
    if (this.nameText) this.nameText.destroy();
    this.setVelocity(0);
    this.destroy();
  }
}
