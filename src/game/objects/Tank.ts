/* eslint-disable @typescript-eslint/no-explicit-any */
import Phaser from "phaser";

export class Tank extends Phaser.Physics.Arcade.Sprite {
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private layer1: any; // Ссылка на слой земли для проверки скорости

  constructor(scene: Phaser.Scene, x: number, y: number, layer1: any) {
    super(scene, x, y, "tank");

    this.layer1 = layer1;

    // Добавляем объект на сцену и включаем физику
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setScale(0.35);
    this.setCollideWorldBounds(true);
    this.setDepth(2);

    // Инициализируем управление внутри танка
    this.cursors = scene.input.keyboard!.createCursorKeys();
  }

  // Вся логика перемещения переехала из MainScene сюда
  public updatePhysics(onGameOver: (reason: string) => void) {
    let baseSpeed;
    let baseRotationSpeed;

    // Проверяем поверхность под танком
    const terrainType = this.getTerrainAt(this.x, this.y);

    switch (terrainType) {
      case "road":
        baseSpeed = 220;
        baseRotationSpeed = 0.04;
        break;
      case "mud":
        baseSpeed = 70;
        baseRotationSpeed = 0.015;
        break;
      case "bush":
        baseSpeed = 100;
        baseRotationSpeed = 0.025;
        break;
      case "water":
        onGameOver("Танк утонул!");
        return;
      case "grass":
      default:
        baseSpeed = 150;
        baseRotationSpeed = 0.03;
        break;
    }

    // Вращение

    const keyW = this.scene.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.W,
    );
    const keyA = this.scene.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.A,
    );
    const keyS = this.scene.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.S,
    );
    const keyD = this.scene.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.D,
    );
    if (keyA.isDown || this.cursors.left.isDown) {
      this.rotation -= baseRotationSpeed;
    }
    if (keyD.isDown || this.cursors.right.isDown) {
      this.rotation += baseRotationSpeed;
    }

    // Направление движения
    const angle = this.rotation;
    const directionX = Math.sin(angle);
    const directionY = -Math.cos(angle);

    // 3. ДВИЖЕНИЕ ТАНКА
    if (keyW.isDown || this.cursors.up.isDown) {
      this.setVelocity(directionX * baseSpeed, directionY * baseSpeed);
    } else if (keyS.isDown || this.cursors.down.isDown) {
      this.setVelocity(-directionX * baseSpeed, -directionY * baseSpeed);
    } else {
      this.setVelocity(0);
    }
  }
  // Метод внутри класса Tank
  public playDamageEffect() {
    // Запускаем быстрое мигание прозрачности танка (от 1 до 0.3 и обратно)
    this.scene.tweens.add({
      targets: this,
      alpha: 0.3,
      duration: 50,
      yoyo: true,
      repeat: 2, // Повторится 2 раза
    });
  }

  private getTerrainAt(worldX: number, worldY: number): string | null {
    const tile = this.layer1.getTileAtWorldXY(worldX, worldY);
    if (tile && tile.properties) {
      if (Array.isArray(tile.properties)) {
        const prop = tile.properties.find((p: any) => p.name === "terrain");
        return prop ? prop.value : null;
      }
      return tile.properties.terrain || null;
    }
    return null;
  }
}
