/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import Phaser from "phaser";
import { io, Socket } from "socket.io-client";
import { Tank } from "../objects/Tank";
import { Bullet } from "../objects/Bullet";
import { RemotePlayer } from "../objects/RemotePlayer";
import { useGameStore } from "../../shared/store/gameStore"; // Импортируйте ваш Zustand стор

export class MainSceneMultiPlayer extends Phaser.Scene {
  private socket!: Socket;
  private tank!: Tank;
  private remotePlayers!: Phaser.GameObjects.Group;
  private bullets!: Phaser.Physics.Arcade.Group;
  private enemyBullets!: Phaser.Physics.Arcade.Group;
  private spaceKey!: Phaser.Input.Keyboard.Key;

  private layer1!: any;
  private layer2!: any;

  // Храним прошлые координаты, чтобы отправлять пакеты на сервер ТОЛЬКО при реальном изменении позиции
  private lastPosition = { x: 0, y: 0, rotation: 0 };

  constructor() {
    super("MainSceneMultiPlayer");
  }

  preload() {
    // Ассеты уже загружены в StartScene, здесь preload оставляем пустым
  }

  create() {
    useGameStore.getState().resetGameStats();

    // 1. Создание карты
    const map = this.make.tilemap({ key: "map1" });
    const sharedTileset = map.addTilesetImage(
      "owlishmedia_pixel_tiles",
      "owlishmedia_pixel_tiles",
    );
    if (!sharedTileset) {
      throw new Error("Не удалось подключить тайлсет карты.");
    }
    this.layer1 = map.createLayer("layer1", sharedTileset, 0, 0)!;
    this.layer2 = map.createLayer("layer2", sharedTileset, 0, 0)!;
    this.layer2.setCollisionBetween(1, 1000);

    // 2. Игрок и его снаряды
    this.tank = new Tank(this, 1150, 700, this.layer1);

    this.bullets = this.physics.add.group({
      classType: Bullet,
      maxSize: 50,
      runChildUpdate: true,
    });

    this.enemyBullets = this.physics.add.group({
      classType: Bullet,
      maxSize: 50,
      runChildUpdate: true,
    });

    // 3. Инициализация группы для соперников
    this.remotePlayers = this.add.group();

    // Настройка камеры и ввода
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.startFollow(this.tank, true, 0.1, 0.1);
    this.spaceKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.SPACE,
    );

    // Коллизии игрока
    this.physics.add.collider(this.tank, this.layer2);
    this.physics.add.collider(this.tank, this.remotePlayers);

    // Попадание ваших пуль в стены карты
    this.physics.add.overlap(
      this.bullets,
      this.layer2,
      this.handleBulletHitWall,
      undefined,
      this,
    );
    // Попадание других пуль в стены карты
    this.physics.add.overlap(
      this.enemyBullets,
      this.layer2,
      this.handleBulletHitWall,
      undefined,
      this,
    );

    // Попадание Моих пуль в СЕТЕВЫХ ИГРОКОВ (Регистрация попадания)
    this.physics.add.overlap(
      this.bullets, // Первый аргумент (объект1)
      this.remotePlayers, // Второй аргумент (объект2)
      this.handleMyBulletHitEnemy,
      undefined,
      this,
    );
    // Попадание соперника в меня (Регистрация попадания)
    this.physics.add.overlap(
      this.enemyBullets,
      this.tank,
      this.handleEnemyHitMe,
      undefined,
      this,
    );

    // ================= НАСТРОЙКА WEB-SOCKETS =================
    // Подключаемся к бэкенду на порту 3000
    this.socket = io("http://localhost:3000");

    this.socket.on("connect", () => {
      console.log("Успешно подключились к серверу сокетов!");
      // Отправляем имя игрока на сервер
      const playerName = "Игрок"; // В будущем заберете из инпута React
      this.socket.emit("joinGame", { name: playerName });
    });
    // Получаем список всех игроков, кто зашел раньше нас
    this.socket.on("currentPlayers", (players: any) => {
      Object.keys(players).forEach((id) => {
        if (id !== this.socket.id) {
          this.createNewRemotePlayer(players[id]);
        }
      });
    });

    // Слушаем подключение нового соперника
    this.socket.on("newPlayer", (playerInfo: any) => {
      this.createNewRemotePlayer(playerInfo);
    });

    // Обновление позиций соперников
    this.socket.on("playerMoved", (playerInfo: any) => {
      this.remotePlayers.getChildren().forEach((remotePlayer: any) => {
        if (remotePlayer.id === playerInfo.id) {
          remotePlayer.updateNetworkPosition(
            playerInfo.x,
            playerInfo.y,
            playerInfo.rotation,
          );
        }
      });
    });

    // Слушаем стрельбу соперников
    this.socket.on("enemyFired", (fireData: any) => {
      const enemyBullet = this.enemyBullets.get() as Bullet | null;
      if (enemyBullet) {
        // Создаем пулю на экранах всех игроков, летящую от чужого танка
        enemyBullet.fire(fireData.x, fireData.y, fireData.rotation);
      }
    });

    // Слушаем изменение здоровья (включая нас самих)
    this.socket.on("playerHealthChanged", (data: any) => {
      if (data.id === this.socket.id) {
        // РАНИЛИ НАС: обновляем Zustand HUD и запускаем мигание
        useGameStore.getState().setHp(data.hp);
        this.tank.playDamageEffect();

        if (data.hp <= 0) {
          this.handleGameOver("Ваш танк был уничтожен в бою!");
        }
      } else {
        // РАНИЛИ СОПЕРНИКА: находим его спрайт и заставляем мигать
        this.remotePlayers.getChildren().forEach((remotePlayer: any) => {
          if (remotePlayer.id === data.id) {
            remotePlayer.playDamageEffect();
          }
        });

        // Если это мы попали в него, увеличиваем счет в HUD за меткий выстрел
        if (data.attackerId === this.socket.id) {
          // Вы можете добавить стейт countsHit в Zustand сторе
          // useGameStore.getState().incrementHit();
        }
      }
    });

    // Синхронное удаление объектов (стен)
    this.socket.on(
      "tileDestroyedByEnemy",
      (tileData: { x: number; y: number }) => {
        this.layer2.removeTileAt(tileData.x, tileData.y, true, true);
      },
    );

    // Слушаем отключение игрока
    this.socket.on("playerDisconnected", (id: string) => {
      this.remotePlayers.getChildren().forEach((remotePlayer: any) => {
        if (remotePlayer.id === id) {
          remotePlayer.destroyPlayer();
        }
      });
    });

    this.socket.on("playerDestroyed", ({ id, killedBy }) => {
      this.remotePlayers.getChildren().forEach((remotePlayer: any) => {
        if (remotePlayer.id === id) {
          remotePlayer.destroyPlayer();
        }
      });
    });

    // Отписка при выходе из игры через React-кнопку
    const unsubscribe = useGameStore.subscribe((state) => {
      if (state.gameStatus === "menu") {
        unsubscribe();

        // 1. Очищаем слушатели сокетов сцены, чтобы не плодить утечки памяти
        this.cleanupSceneListeners();

        // 2. Рвем сетевое соединение (сервер тут же уберет танк у остальных игроков)
        if (this.socket) {
          this.socket.disconnect();
        }

        // 3. Чистим физику и уходим в стартовую сцену Phaser
        this.physics.pause();
        if (this.tank) this.tank.destroy();
        this.scene.start("StartScene");
        this.cleanupSceneListeners();
      }
    });
  }

  update(time: number, delta: number) {
    if (useGameStore.getState().gameStatus !== "multiPlayer") return;

    // 1. Двигаем наш танк локально через клавиатуру
    this.tank.updatePhysics((reason) => this.handleGameOver(reason));

    // 2. ОТПРАВКА НАШИХ КООРДИНАТ НА СЕРВЕР (Только если они изменились)
    if (
      this.tank.x !== this.lastPosition.x ||
      this.tank.y !== this.lastPosition.y ||
      this.tank.rotation !== this.lastPosition.rotation
    ) {
      this.socket.emit("playerMovement", {
        x: this.tank.x,
        y: this.tank.y,
        rotation: this.tank.rotation,
      });

      this.lastPosition = {
        x: this.tank.x,
        y: this.tank.y,
        rotation: this.tank.rotation,
      };
    }

    // Стрельба
    if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
      this.shoot();
    }
  }

  private shoot() {
    const currentBullets = useGameStore.getState().bulletsCount;
    if (currentBullets <= 0) return;

    const bullet = this.bullets.get() as Bullet | null;
    if (bullet) {
      bullet.fire(this.tank.x, this.tank.y, this.tank.rotation);
      useGameStore.getState().setBulletsCount(currentBullets - 1);

      // СЕТЕВАЯ СТРЕЛЬБА: Сообщаем серверу, что мы сделали выстрел
      this.socket.emit("playerFire", {
        x: this.tank.x,
        y: this.tank.y,
        rotation: this.tank.rotation,
      });
    }
  }

  private createNewRemotePlayer(playerInfo: any) {
    const remotePlayer = new RemotePlayer(
      this,
      playerInfo.x,
      playerInfo.y,
      playerInfo.id,
      playerInfo.name,
    );

    // Добавляем в обычную группу (теперь настройки immovable внутри RemotePlayer не слетят!)
    this.remotePlayers.add(remotePlayer);

    // НАДО ДОБАВИТЬ: Жесткое столкновение вашего танка с конкретно этим игроком
    this.physics.add.collider(this.tank, remotePlayer);
  }

  private handleMyBulletHitEnemy(bulletObject: any, remotePlayerObject: any) {
    // На случай, если Phaser перепутал аргументы местами:
    // Проверяем, принадлежит ли объект группе наших пуль
    let bullet: Bullet;
    let remotePlayer: RemotePlayer;

    if (this.bullets.contains(bulletObject)) {
      bullet = bulletObject as Bullet;
      remotePlayer = remotePlayerObject as RemotePlayer;
    } else {
      bullet = remotePlayerObject as Bullet;
      remotePlayer = bulletObject as RemotePlayer;
    }

    // Если пуля уже неактивна, ничего не делаем
    if (!bullet || !bullet.active) return;

    // Теперь метод .kill() гарантированно существует, так как это экземпляр класса Bullet
    bullet.kill();

    // Отправляем на сервер информацию, что мы попали в танк соперника
    this.socket.emit("hitPlayer", {
      targetId: remotePlayer.id,
      damage: 50,
    });
  }

  private handleEnemyHitMe(tankObject: any, enemyBulletObject: any) {
    let enemyBullet: Bullet;

    // Проверяем, какой из аргументов является пулей из вражеской группы
    if (this.enemyBullets.contains(enemyBulletObject)) {
      enemyBullet = enemyBulletObject as Bullet;
    } else {
      enemyBullet = tankObject as Bullet;
    }

    if (!enemyBullet || !enemyBullet.active) return;

    // Визуально уничтожаем чужую пулю на своем экране
    enemyBullet.kill();
  }

  private handleBulletHitWall(bullet: any, tile: any) {
    if (!bullet.active || tile.index === -1) return;
    (bullet as Bullet).kill();
    // Отправляем запрос на удаление плитки у всех (включая себя)
    // Чтобы избежать двойного удаления, локально removeTileAt выполнит событие сокета 'tileDestroyedByEnemy'
    const isMyBullet = this.bullets.contains(bullet);
    if (isMyBullet) {
      this.socket.emit("tileDestroyed", { x: tile.x, y: tile.y });
    }
  }

  //   private handleDesroyRemotePlayer(bullet: any, tile: any) {
  //     if (!bullet.active || tile.index === -1) return;
  //     (bullet as Bullet).kill();
  //     // Отправляем запрос на удаление плитки у всех (включая себя)
  //     // Чтобы избежать двойного удаления, локально removeTileAt выполнит событие сокета 'tileDestroyedByEnemy'
  //     const isMyBullet = this.bullets.contains(bullet);
  //     if (isMyBullet) {
  //       this.socket.emit("tileDestroyed", { x: tile.x, y: tile.y });
  //     }
  //   }

  private handleGameOver(reason: string) {
    // 1. Бьем по тормозам и отключаем физический движок
    this.tank.setVelocity(0);
    this.physics.pause();

    // 2. Скрываем свой танк визуально и отключаем его хитбокс
    this.tank.setActive(false);
    this.tank.setVisible(false);
    if (this.tank.body) {
      this.tank.body.enable = false; // Пули в нас больше не полетят
    }

    // 4. Отрисовка текста по центру камеры
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
        `Причина: ${reason} \nНажмите кнопку Выход.`,
        {
          fontSize: "25px",
          color: "#ffffff",
          align: "center",
        },
      )
      .setOrigin(0.5)
      .setDepth(10);
  }

  private cleanupSceneListeners() {
    if (this.socket) {
      this.socket.off("currentPlayers");
      this.socket.off("newPlayer");
      this.socket.off("playerMoved");
      this.socket.off("enemyFired");
      this.socket.off("playerHealthChanged");
      this.socket.off("playerDisconnected");
      this.socket.off("tileDestroyedByEnemy");
    }
  }
}
