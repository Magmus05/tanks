import Phaser from "phaser";
import { Bullet } from "./Bullet";

export class EnemyTank extends Phaser.Physics.Arcade.Sprite {
  public hp: number = 100;
  private moveTimer!: Phaser.Time.TimerEvent;
  private shootTimer!: Phaser.Time.TimerEvent;
  private currentAction: number = 0; // 0 - стоять, 1 - вперед, 2 - назад, 3 - влево, 4 - вправо
  private bulletsGroup: Phaser.Physics.Arcade.Group;
  private nameText!: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    name: string,
    bulletsGroup: Phaser.Physics.Arcade.Group,
  ) {
    // В Tiled у вас один тайлсет, но для бота можно использовать ту же текстуру "tank" или другую, если загрузите
    super(scene, x, y, "tank");

    this.bulletsGroup = bulletsGroup;

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
    // Подкрасим бота в красный цвет, чтобы отличать от игрока
    this.setTint(0xff5555);
    // this.setBodySize(60, 60, true); // уменьшение тела

    // СОЗДАНИЕ ИМЕНИ: Создаем текст над головой бота
    this.nameText = scene.add
      .text(x, y - 40, name, {
        fontSize: "16px",
        color: "#ff5555",
        fontStyle: "bold",
        backgroundColor: "rgba(252, 248, 248, 1)",
      })
      .setOrigin(0.5)
      .setDepth(10);

    // Таймер смены действий (каждые 1.5 секунды бот решает, куда ехать)
    this.moveTimer = scene.time.addEvent({
      delay: 1500,
      callback: this.chooseNewAction,
      callbackScope: this,
      loop: true,
    });

    // Таймер стрельбы (каждые 2 секунды бот стреляет в пустоту)
    this.shootTimer = scene.time.addEvent({
      delay: 2000,
      callback: this.shoot,
      callbackScope: this,
      loop: true,
    });
  }

  private chooseNewAction() {
    // Случайное число от 0 до 4
    this.currentAction = Phaser.Math.Between(0, 4);
    // Сбрасываем скорость перед сменой действия, чтобы танк не «пробивал» стены по инерции
    this.setVelocity(0);
  }

  public updateAI() {
    if (this.hp <= 0) return;

    // УМНЫЙ ИИ: Проверяем, упёрся ли бот в препятствие или границу карты.
    // Если бот пытается ехать (action 1 или 2), но его тело заблокировано (blocked/touching)
    if (
      (this.currentAction === 1 || this.currentAction === 2) &&
      (this.body?.blocked.left ||
        this.body?.blocked.right ||
        this.body?.blocked.up ||
        this.body?.blocked.down ||
        this.body?.touching.left ||
        this.body?.touching.right ||
        this.body?.touching.up ||
        this.body?.touching.down)
    ) {
      // Принудительно заставляем его развернуться в следующем кадре, чтобы он не буксовал в стене
      this.currentAction = Phaser.Math.Between(3, 4);
      this.setVelocity(0, 0);
    }

    const speed = 100;
    const rotationSpeedDeg = 90; // Скорость вращения в градусах в секунду для Arcade Physics
    let angleForward;
    let angleBackward;
    switch (this.currentAction) {
      case 1: // Вперед
        this.setAngularVelocity(0); // Не вращаемся во время движения
        angleForward = this.rotation;
        this.setVelocity(
          Math.sin(angleForward) * speed,
          -Math.cos(angleForward) * speed,
        );
        break;
      case 2: // Назад
        this.setAngularVelocity(0);
        angleBackward = this.rotation;
        this.setVelocity(
          -Math.sin(angleBackward) * speed,
          Math.cos(angleBackward) * speed,
        );
        break;
      case 3: // ИСПРАВЛЕНО: Вращение влево через физику (градусы в секунду)
        this.setVelocity(0, 0);
        this.setAngularVelocity(-rotationSpeedDeg);
        break;
      case 4: // ИСПРАВЛЕНО: Вращение вправо через физику
        this.setVelocity(0, 0);
        this.setAngularVelocity(rotationSpeedDeg);
        break;
      case 0: // Стоять
      default:
        this.setVelocity(0, 0);
        this.setAngularVelocity(0);
        break;
    }

    if (this.nameText && this.active) {
      this.nameText.setPosition(this.x, this.y + 10);
    }
  }

  private shoot() {
    if (this.hp <= 0) return;

    const bullet = this.bulletsGroup.get() as Bullet | null;
    if (bullet) {
      // Стреляем из пушки бота в направлении его поворота
      bullet.fire(this.x, this.y, this.rotation);
    }
  }

  // Метод получения урона
  public takeDamage(amount: number): boolean {
    this.hp -= amount;

    // Эффект мигания при получении урона
    this.scene.tweens.add({
      targets: this,
      alpha: 0.1,
      duration: 30,
      yoyo: true,
      repeat: 2,
    });

    if (this.hp <= 0) {
      this.destroyTank();
      return true; // Бот уничтожен
    }
    return false;
  }

  private destroyTank() {
    // Останавливаем таймеры
    this.moveTimer.destroy();
    this.shootTimer.destroy();

    // Удаляем текст имени вместе с танком
    if (this.nameText) {
      this.nameText.destroy();
    }

    // Взрыв или просто исчезновение
    this.setVelocity(0);
    this.destroy();
  }
}
