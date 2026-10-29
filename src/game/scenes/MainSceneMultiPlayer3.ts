/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import Phaser from "phaser";
import { Socket } from "socket.io-client";
import { Tank } from "../objects/Tank";
import { Bullet } from "../objects/Bullet";
import { RemotePlayer } from "../objects/RemotePlayer";
import { useGameStore } from "../../shared/store/gameStore";
import { networkSocket } from "../../components/main-menu/MainMenu";

export class MainSceneMultiPlayer extends Phaser.Scene {
  private socket!: Socket;
  private tank!: Tank;
  private bullets!: Phaser.Physics.Arcade.Group;
  private enemyBullets!: Phaser.Physics.Arcade.Group; // Будет успешно создана
  private spaceKey!: Phaser.Input.Keyboard.Key;

  private layer1!: any;
  private layer2!: any;

  private remotePlayers!: Phaser.GameObjects.Group;
  private lastPosition = { x: 0, y: 0, rotation: 0 };

  constructor() {
    super("MainSceneMultiPlayer");
  }

  preload() {
    // Ассеты загружены в StartScene
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

    // Инициализируем обычную группу для танков врагов (исправляет ошибку типов)
    this.remotePlayers = this.add.group();

    // Группы снарядов
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

    // Создаем ваш танк в скрытой точке (сервер переместит его куда надо)
    // this.tank = new Tank(this, -1000, -1000, this.layer1);

    this.socket = networkSocket!;

    // Очищаем старые подписки
    // this.socket.off("currentPlayers");
    // this.socket.off("newPlayer");
    // this.socket.off("playerMoved");
    // this.socket.off("enemyFired");
    // this.socket.off("playerHealthChanged");
    // this.socket.off("playerDisconnected");
    // this.socket.off("tileDestroyedByEnemy");

    // Слушаем список игроков
    this.socket.on("startNetworkGame", (players: any) => {
      console.log(players);

      Object.keys(players).forEach((id) => {
        if (id === this.socket.id) {
          this.tank = new Tank(this, players[id].x, players[id].y, this.layer1);
          // Телепортируем наш танк на выданное сервером место (200 + index * 150)
          // this.tank.setPosition(players[id].x, players[id].y);
          useGameStore.getState().setHp(players[id].hp);
          this.lastPosition = {
            x: this.tank.x,
            y: this.tank.y,
            rotation: this.tank.rotation,
          };
        } else {
          this.createNewRemotePlayer(players[id]);
        }
      });
    });

    // Камера и ввод
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.startFollow(this.tank, true, 0.1, 0.1);
    this.spaceKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.SPACE,
    );

    // Коллизии локального танка со стенами
    this.physics.add.collider(this.tank, this.layer2);

    // Оверлапы пули со стенами
    this.physics.add.overlap(
      this.bullets,
      this.layer2,
      this.handleBulletHitWall,
      undefined,
      this,
    );
    this.physics.add.overlap(
      this.enemyBullets,
      this.layer2,
      this.handleBulletHitWall,
      undefined,
      this,
    );

    // Чужие пули попадают в меня
    this.physics.add.overlap(
      this.enemyBullets,
      this.tank,
      this.handleEnemyHitMe,
      undefined,
      this,
    );

    // ================= НАСТРОЙКА WEB-SOCKETS =================

    // Новый игрок
    this.socket.on("newPlayer", (playerInfo: any) => {
      if (playerInfo.id === this.socket.id) return;
      this.createNewRemotePlayer(playerInfo);
    });

    // Перемещение
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

    // Стрельба врага
    this.socket.on("enemyFired", (fireData: any) => {
      if (fireData.playerId === this.socket.id) return;
      const bullet = this.enemyBullets.get() as Bullet | null;
      if (bullet) {
        bullet.fire(fireData.x, fireData.y, fireData.rotation);
      }
    });

    // Синхронное удаление объектов (стен)
    this.socket.on(
      "tileDestroyedByEnemy",
      (tileData: { x: number; y: number }) => {
        this.layer2.removeTileAt(tileData.x, tileData.y, true, true);
      },
    );

    // Здоровье
    this.socket.on("playerHealthChanged", (data: any) => {
      if (data.id === this.socket.id) {
        useGameStore.getState().setHp(data.hp);
        if (data.hp <= 0) this.handleGameOver("Ваш танк был уничтожен!");
      } else {
        this.remotePlayers.getChildren().forEach((remotePlayer: any) => {
          if (remotePlayer.id === data.id) {
            remotePlayer.playDamageEffect();
            if (data.hp <= 0) remotePlayer.destroyPlayer();
          }
        });
      }
    });

    this.socket.on("playerDisconnected", (id: string) => {
      this.remotePlayers.getChildren().forEach((remotePlayer: any) => {
        if (remotePlayer.id === id) remotePlayer.destroyPlayer();
      });
    });

    // Просим сервер дать нам игроков, если мы пропустили начальный io.emit во время загрузки сцены
    this.socket.emit("requestActivePlayers");

    // Обработка оверлапа ваших пуль с врагами (динамически обновляется)
    this.physics.add.overlap(
      this.bullets,
      this.remotePlayers.getChildren(),
      this.handleMyBulletHitEnemy,
      undefined,
      this,
    );

    // React-отписка
    const unsubscribe = useGameStore.subscribe((state) => {
      if (state.gameStatus === "menu") {
        unsubscribe();
        this.socket.disconnect();
        this.physics.pause();
        this.scene.start("StartScene");
      }
    });
  }

  // Вспомогательный метод создания врага
  private createNewRemotePlayer(playerInfo: any) {
    // Проверяем, нет ли его уже на сцене
    const alreadyExists = this.remotePlayers
      .getChildren()
      .some((p: any) => p.id === playerInfo.id);
    if (alreadyExists) return;

    const remotePlayer = new RemotePlayer(
      this,
      playerInfo.x,
      playerInfo.y,
      playerInfo.id,
      playerInfo.name,
    );

    // Добавляем в обычную группу Phaser
    this.remotePlayers.add(remotePlayer);

    // Включаем коллизии между НАШИМ танком и этим новым врагом
    this.physics.add.collider(this.tank, remotePlayer);
    // Включаем коллизии врага со стенами
    this.physics.add.collider(remotePlayer, this.layer2);
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

  update(time: number, delta: number) {
    // ВНИМАНИЕ: Проверьте, совпадает ли регистр строки с вашим Zustand-стором ("multiPlayer" или "multiplayerLobby")
    if (useGameStore.getState().gameStatus !== "multiPlayer") return;

    // 1. Двигаем наш танк локально через клавиатуру
    this.tank.updatePhysics((reason) => this.handleGameOver(reason));

    // 2. ОТПРАВКА НАШИХ КООРДИНАТ НА СЕРВЕР (Только при изменении)
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

      this.socket.emit("playerFire", {
        x: this.tank.x,
        y: this.tank.y,
        rotation: this.tank.rotation,
      });
    }
  }

  // private createNewRemotePlayer(playerInfo: any) {
  //   const remotePlayer = new RemotePlayer(
  //     this,
  //     playerInfo.x,
  //     playerInfo.y,
  //     playerInfo.id,
  //     playerInfo.name,
  //   );
  //   this.remotePlayers.add(remotePlayer);
  // }

  // private handleBulletHitWall(bullet: any, tile: any) {
  //   if (!bullet.active || tile.index === -1) return;

  //   // Уничтожаем пулю визуально и физически
  //   (bullet as Bullet).kill();

  //   // Удаляем плитку у себя локально
  //   this.layer2.removeTileAt(tile.x, tile.y, true, true);

  //   // Проверяем, принадлежит ли пуля локальному игроку
  //   // (Так как у вас bullets и enemyBullets — это разные группы)
  //   const isMyBullet = this.bullets.contains(bullet);

  //   if (isMyBullet) {
  //     // Отправляем серверу координаты плитки (в сетке тайлов, а не пикселях)
  //     this.socket.emit("tileDestroyed", {
  //       x: tile.x,
  //       y: tile.y,
  //     });
  //   }
  // }

  private handleMyBulletHitEnemy(bullet: any, remotePlayer: any) {
    if (!bullet.active) return;
    (bullet as Bullet).kill();

    this.socket.emit("hitPlayer", {
      targetId: remotePlayer.id,
      damage: 20,
    });
  }

  // ИСПРАВЛЕНО: Добавлен корректно закрытый метод для получения урона от чужой пули
  private handleEnemyHitMe(tank: any, bullet: any) {
    if (!bullet.active) return;
    (bullet as Bullet).kill();
    // Локально здоровье не отнимаем, ждем команду с сервера по сокетам!
  }

  private handleGameOver(reason: string) {
    this.socket.disconnect();
    this.physics.pause();

    const cam = this.cameras.main;
    const centerX = cam.scrollX + cam.width / 2;
    const centerY = cam.scrollY + cam.height / 2;

    this.add
      .text(centerX, centerY - 50, "GAME OVER", {
        fontSize: "48px",
        color: "#ff0000",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(10);
  }
}
