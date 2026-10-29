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

    if (this.body) {
      // Убираем любой физический отскок/импульс
      const arcadeBody = this.body as Phaser.Physics.Arcade.Body;

      // Правильная установка immovable через свойство
      arcadeBody.immovable = true;

      // Правильное изменение bounce через свойства Vector2 (x и y)
      arcadeBody.bounce.x = 0;
      arcadeBody.bounce.y = 0;
    }

    this.setScale(0.35);
    this.setCollideWorldBounds(true);
    this.setDepth(2);

    // Подкрашиваем чужие сетевые танки в сине-голубой цвет, чтобы отличать от ботов и себя
    this.setTint(0x881111);
    this.setBodySize(150, 150, true);
    console.log(this);

    // Имя игрока над танком
    this.nameText = scene.add
      .text(x, y - 40, name, {
        fontSize: "16px",
        color: "#ff2828",
        fontStyle: "bold",
        backgroundColor: "rgba(252, 248, 248, 0.8)",
      })
      .setOrigin(0.5)
      .setDepth(10);
  }

  // Сюда мы будем передавать новые координаты из сокетов
  public updateNetworkPosition(x: number, y: number, rotation: number) {
    this.setPosition(x, y);
    this.setRotation(rotation);

    // НАДО ДОБАВИТЬ: Гарантируем, что у танка нет никаких остаточных физических скоростей
    if (this.body) {
      const arcadeBody = this.body as Phaser.Physics.Arcade.Body;
      arcadeBody.setVelocity(0, 0);
    }

    if (this.nameText && this.active) {
      this.nameText.setPosition(this.x, this.y - 40);
    }
  }

  public playDamageEffect() {
    // Останавливаем текущие анимации на этом объекте, чтобы они не накладывались
    this.scene.tweens.killTweensOf(this);
    this.setAlpha(1); // Сбрасываем в полную видимость
    // Запускаем быстрое мигание прозрачности танка (от 1 до 0.3 и обратно)
    this.scene.tweens.add({
      targets: this,
      alpha: 0.2,
      duration: 80,
      yoyo: true,
      repeat: 2,
      onComplete: () => {
        this.setAlpha(1); // Гарантированно возвращаем видимость в 100%
      },
    });
  }

  public destroyPlayer() {
    if (this.nameText) this.nameText.destroy();
    this.setVelocity(0);
    this.destroy();
  }
}
