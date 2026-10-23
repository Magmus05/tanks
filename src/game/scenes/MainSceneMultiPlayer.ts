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
  private bullets!: Phaser.Physics.Arcade.Group;
  private spaceKey!: Phaser.Input.Keyboard.Key;

  private layer1!: any;
  private layer2!: any;

  // Группа для хранения сетевых танков соперников
  private remotePlayers!: Phaser.Physics.Arcade.Group;

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

    // 3. Инициализация группы для соперников
    this.remotePlayers = this.physics.add.group();

    // Настройка камеры и ввода
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.startFollow(this.tank, true, 0.1, 0.1);
    this.spaceKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.SPACE,
    );

    // Коллизии игрока
    this.physics.add.collider(this.tank, this.layer2);
    this.physics.add.collider(this.tank, this.remotePlayers);
    // this.physics.add.collider(this.remotePlayers, this.layer2);

    // Попадание ваших пуль в стены карты
    this.physics.add.overlap(
      this.bullets,
      this.layer2,
      this.handleBulletHitWall,
      undefined,
      this,
    );

    // Попадание ВАШИХ пуль в СЕТЕВЫХ ИГРОКОВ (Регистрация попадания)
    this.physics.add.overlap(
      this.bullets,
      this.remotePlayers,
      this.handleMyBulletHitEnemy,
      undefined,
      this,
    );

    // ================= НАСТРОЙКА WEB-SOCKETS =================
    // Подключаемся к бэкенду на порту 3000
    this.socket = io("http://192.168.88.216:3000");

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
      const bullet = this.bullets.get() as Bullet | null;
      if (bullet) {
        // Создаем пулю на экранах всех игроков, летящую от чужого танка
        bullet.fire(fireData.x, fireData.y, fireData.rotation);
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
        this.socket.disconnect(); // Рвем сетевое соединение
        this.physics.pause();
        this.scene.start("StartScene");
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

    // Отправляем на сервер информацию, что мы попали в танк соперника
    this.socket.emit("hitPlayer", {
      targetId: remotePlayer.id,
      damage: 10, // Сносим по 20 HP за попадание
    });
  }

  private handleGameOver(reason: string) {
    this.socket.disconnect();
    this.physics.pause();
    // Дальше вывод вашего текста Game Over на экран...
  }
}
