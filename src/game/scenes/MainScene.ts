/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import Phaser from "phaser";
import { Bullet } from "../objects/Bullet";
import { Tank } from "../objects/Tank";
import { useGameStore } from "../../shared/store/gameStore";
import { EnemyTank } from "../objects/EnemyTank";

export class MainScene extends Phaser.Scene {
  private tank!: Tank;
  private bullets!: Phaser.Physics.Arcade.Group;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private layer1!: any;
  private layer2!: any;
  private isGameOver: boolean = false;
  private enemies!: Phaser.Physics.Arcade.Group;
  private enemyBullets!: Phaser.Physics.Arcade.Group; // Снаряды ботов, чтобы они не ранили сами себя

  constructor() {
    super("MainScene");
  }

  preload() {}

  create() {
    // Создание Карты
    useGameStore.getState().resetGameStats();
    const map = this.make.tilemap({ key: "map1" });
    const sharedTileset = map.addTilesetImage(
      "owlishmedia_pixel_tiles",
      "owlishmedia_pixel_tiles",
    );
    if (!sharedTileset) {
      throw new Error("Не удалось подключить тайлсет карты.");
    }
    // Сохраняем слой в переменную класса
    this.layer1 = map.createLayer("layer1", sharedTileset, 0, 0)!;
    this.layer2 = map.createLayer("layer2", sharedTileset, 0, 0)!;
    // console.log(this.layer2);
    // ВКЛЮЧАЕМ СТОЛКНОВЕНИЯ ДЛЯ СЛОЯ ОБЪЕКТОВ
    // Передаем диапазон индексов тайлов, которые должны быть твердыми.
    // Так как 0 — это пустой тайл, мы говорим: все тайлы от 1 до 1000 имеют коллизию.
    this.layer2.setCollisionBetween(1, 1000);

    // 2. Создание объектов (Танк и Снаряды)
    this.tank = new Tank(this, 1065, 700, this.layer1);
    this.bullets = this.physics.add.group({
      classType: Bullet,
      maxSize: 50,
      runChildUpdate: true, // Важно! Заставляет Phaser автоматически вызывать update() внутри Bullet
    });

    // 3. БОТЫ! Создаем группу для ботов и группу для ИХ снарядов
    this.enemyBullets = this.physics.add.group({
      classType: Bullet,
      maxSize: 50,
      runChildUpdate: true,
    });

    this.enemies = this.physics.add.group();

    // Спавним двух ботов в разных частях карты
    const botsCount = useGameStore.getState().countBots;

    Array.from({ length: botsCount }).forEach((_, i) => {
      // Вычисляем координаты динамически, чтобы боты не спавнились в одной точке
      // Например, расставляем их по горизонтали с шагом в 200 пикселей:
      const x = 100 + i * 150;
      const y = 200;
      // Создаем танк. На каждой итерации цикла i меняется (0, 1, 2...)
      const enemy = new EnemyTank(
        this,
        x,
        y,
        `Бот ${i + 1}`, // Имя будет "Бот 1", "Бот 2" и т.д.
        this.enemyBullets,
      );
      // Добавляем в группу Phaser
      this.enemies.add(enemy);
    });

    // 4. Камера и ввод
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.startFollow(this.tank, true, 0.1, 0.1);
    this.spaceKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.SPACE,
    );

    // 4. Физика взаимодействия

    // Танк игрока сталкивается со стенами и с ботами
    this.physics.add.collider(this.tank, this.layer2);
    this.physics.add.collider(this.tank, this.enemies);
    this.physics.add.collider(this.enemies, this.layer2);
    this.physics.add.collider(this.enemies, this.enemies);

    // Снаряды игрока разрушают layer2 (стены)
    this.physics.add.overlap(
      this.bullets,
      this.layer2,
      this.handleBulletHit,
      undefined,
      this,
    );
    // Снаряды ботов ТОЖЕ разрушают layer2 (стены)
    this.physics.add.overlap(
      this.enemyBullets,
      this.layer2,
      this.handleBulletHit,
      undefined,
      this,
    );

    // Снаряды ИГРОКА попадают в БОТОВ
    this.physics.add.overlap(
      this.bullets,
      this.enemies,
      this.handlePlayerHitEnemy,
      undefined,
      this,
    );

    // Снаряды БОТОВ попадают в ИГРОКА
    this.physics.add.overlap(
      this.enemyBullets,
      this.tank,
      this.handleEnemyHitPlayer,
      undefined,
      this,
    );
    // ПОДПИСКА НА ВЫХОД из игры
    const unsubscribe = useGameStore.subscribe((state) => {
      if (state.gameStatus === "menu") {
        // 1. Отписываемся от стора, чтобы не было утечек памяти
        unsubscribe();

        // 2. Полностью останавливаем физику и таймеры текущей сцены
        this.physics.pause();

        // 3. Возвращаем Phaser на пустую стартовую сцену, которая ждет нового запуска
        this.scene.start("StartScene");
      }
    });
  }

  update(time: number, delta: number) {
    if (this.isGameOver) return;
    if (useGameStore.getState().gameStatus !== "singlePlayer") return;
    // Передаем логику обновления физики в класс танка
    this.tank.updatePhysics((reason) => this.handleGameOver(reason));
    // Обновляем AI каждого живого бота в группе
    this.enemies.getChildren().forEach((enemy: any) => {
      enemy.updateAI();
    });
    // Стрельба
    if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
      this.shoot();
    }
  }
  // Попадание игрока во врага
  private handlePlayerHitEnemy(bullet: any, enemy: any) {
    if (!bullet.active) return;
    bullet.kill(); // Уничтожаем пулю игрока
    useGameStore.getState().incrementСountsHit();
    // Наносим боту 25 урона
    const isDestroyed = (enemy as EnemyTank).takeDamage(10);

    if (isDestroyed) {
      // Если бот умер — увеличиваем счет в Zustand HUD
      useGameStore.getState().incrementScore();
    }
  }

  // Попадание бота в игрока
  private handleEnemyHitPlayer(tank: any, bullet: any) {
    if (!bullet.active) return;
    bullet.kill();

    // Запускаем эффект мигания для танка игрока!
    this.tank.playDamageEffect();

    const store = useGameStore.getState();
    const newHp = store.hp - 10;

    if (newHp <= 0) {
      store.setHp(0);
      this.handleGameOver("Ваш танк уничтожен снарядом противника!");
    } else {
      store.setHp(newHp);
    }
  }

  private handleBulletHit(bullet: any, tile: any) {
    if (!bullet.active || tile.index === -1) return;

    // Вызываем метод уничтожения снаряда внутри его собственного класса
    (bullet as Bullet).kill();

    // Удаляем объект
    this.layer2.removeTileAt(tile.x, tile.y, true, true);
    // Начисляем очки за уничтожение объекта/врага!
    // useGameStore.getState().incrementScore();
  }

  private handleGameOver(reason: string) {
    console.log("Game Over:", reason);
    this.tank.setVelocity(0);
    this.physics.pause();

    // Выводим текст по центру экрана камеры
    const cam = this.cameras.main;
    const centerX = cam.scrollX + cam.width / 2;
    const centerY = cam.scrollY + cam.height / 2;

    this.add
      .text(centerX, centerY - 50, "Потрачено", {
        fontSize: "48px",
        color: "#ff0000",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(10);

    this.add
      .text(
        centerX,
        centerY + 20,
        `Причина: ${reason}\nНажмите SPACE для перезапуска`,
        {
          fontSize: "25px",
          color: "#ffffff",
          align: "center",
        },
      )
      .setOrigin(0.5)
      .setDepth(10);

    // Перезапуск сцены
    this.spaceKey.on("down", () => {
      this.scene.restart();
    });
  }

  private shoot() {
    // Проверяем текущее количество патронов в Zustand
    const currentBullets = useGameStore.getState().bulletsCount;
    if (currentBullets <= 0) return;

    const bullet = this.bullets.get() as Bullet | null;
    if (bullet) {
      bullet.fire(this.tank.x, this.tank.y, this.tank.rotation);
      // Уменьшаем количество патронов в сторе
      useGameStore.getState().setBulletsCount(currentBullets - 1);
    }
  }
}
