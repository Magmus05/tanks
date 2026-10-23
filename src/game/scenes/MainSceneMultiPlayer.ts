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

  private remotePlayers!: Phaser.Physics.Arcade.Group;
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

    // =========================================================================
    // ИСПРАВЛЕНО: Сначала инициализируем ВСЕ группы, чтобы избежать undefined
    // =========================================================================

    // Создание локального танка игрока
    this.tank = new Tank(this, 1150, 700, this.layer1);

    // Группа ВАШИХ снарядов
    this.bullets = this.physics.add.group({
      classType: Bullet,
      maxSize: 50,
      runChildUpdate: true,
    });

    // ИСПРАВЛЕНИЕ: Создаем группу ЧУЖИХ снарядов
    this.enemyBullets = this.physics.add.group({
      classType: Bullet,
      maxSize: 50,
      runChildUpdate: true,
    });

    // Группа сетевых танков соперников
    this.remotePlayers = this.physics.add.group();

    // Настройка камеры и ввода
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.startFollow(this.tank, true, 0.1, 0.1);
    this.spaceKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.SPACE,
    );

    // Коллизии объектов
    this.physics.add.collider(this.tank, this.layer2);
    this.physics.add.collider(this.tank, this.remotePlayers);
    this.physics.add.collider(this.remotePlayers, this.layer2); // Раскомментировано для честных столкновений врагов со стенами

    // =========================================================================
    // Теперь физические группы готовы, настраиваем оверлапы без ошибок
    // =========================================================================

    // Столкновение снарядов со стенами карты
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

    // Ваши пули могут попасть ТОЛЬКО в чужие танки
    this.physics.add.overlap(
      this.bullets,
      this.remotePlayers,
      this.handleMyBulletHitEnemy,
      undefined,
      this,
    );

    // Чужие пули могут попасть ТОЛЬКО в ваш танк
    this.physics.add.overlap(
      this.enemyBullets,
      this.tank,
      this.handleEnemyHitMe,
      undefined,
      this,
    );

    // ================= НАСТРОЙКА WEB-SOCKETS =================
    this.socket = networkSocket!;

    // Сообщаем серверу, что наша сцена загрузилась и мы готовы получить танки
    this.socket.emit("requestActivePlayers");

    this.socket.on("connect", () => {
      console.log("Успешно подключились к серверу сокетов!");
      const playerName = "Игрок";
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

    // ИСПРАВЛЕНО: Теперь пуля противника берется из ПРАВИЛЬНОЙ группы enemyBullets
    this.socket.on("enemyFired", (fireData: any) => {
      const bullet = this.enemyBullets.get() as Bullet | null;
      if (bullet) {
        bullet.fire(fireData.x, fireData.y, fireData.rotation);
      }
    });

    // Слушаем изменение здоровья
    this.socket.on("playerHealthChanged", (data: any) => {
      if (data.id === this.socket.id) {
        // Урон нанесли НАМ
        useGameStore.getState().setHp(data.hp);
        this.tank.playDamageEffect();

        if (data.hp <= 0) {
          this.handleGameOver("Ваш танк был уничтожен в бою!");
        }
      } else {
        // Урон нанесли СОПЕРНИКУ
        this.remotePlayers.getChildren().forEach((remotePlayer: any) => {
          if (remotePlayer.id === data.id) {
            remotePlayer.playDamageEffect();
          }
        });
      }
    });

    // Слушаем отключение игрока
    this.socket.on("playerDisconnected", (id: string) => {
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
        this.socket.disconnect();
        this.physics.pause();
        this.scene.start("StartScene");
      }
    });
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

  private createNewRemotePlayer(playerInfo: any) {
    const remotePlayer = new RemotePlayer(
      this,
      playerInfo.x,
      playerInfo.y,
      playerInfo.id,
      playerInfo.name,
    );
    this.remotePlayers.add(remotePlayer);
  }

  private handleBulletHitWall(bullet: any, tile: any) {
    if (!bullet.active || tile.index === -1) return;
    (bullet as Bullet).kill();
    this.layer2.removeTileAt(tile.x, tile.y, true, true);
  }

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
