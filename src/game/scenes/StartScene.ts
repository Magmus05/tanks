import Phaser from "phaser";
import { useGameStore } from "../../shared/store/gameStore";

export class StartScene extends Phaser.Scene {
  constructor() {
    super("StartScene");
  }

  preload() {
    this.load.image("tank", "/assets/tank.png");
    this.load.image("bullet", "/assets/bullet.png");
    this.load.image(
      "owlishmedia_pixel_tiles",
      "/maps/tilesets/owlishmedia_pixel_tiles.png",
    );
    this.load.tilemapTiledJSON("map1", "/maps/map1.json");

    // Как только Phaser всё скачал — обновляем Zustand
    this.load.on("complete", () => {
      useGameStore.getState().setAssetsLoaded(true);
      console.log("Ассеты загружены в фоне!");
    });
  }

  create() {
    // === ДОБАВЛЯЕМ ПРОВЕРКУ ТЕКУЩЕГО СОСТОЯНИЯ (Кейс для сверхбыстрого клика) ===
    const currentStore = useGameStore.getState();

    // Если на момент старта сцены статус УЖЕ "playing" и всё УЖЕ загрузилось
    if (currentStore.gameStatus === "playing" && currentStore.isAssetsLoaded) {
      this.scene.start("MainScene");
      return; // Выходим, подписка не нужна
    }

    // === ДЛЯ ВСЕХ ОСТАЛЬНЫХ СЛУЧАЕВ (Обычное ожидание клика в меню) ===
    const unsubscribe = useGameStore.subscribe((state) => {
      const status: string = state.gameStatus;
      const loaded: boolean = state.isAssetsLoaded;

      if (status === "playing" && loaded) {
        unsubscribe();
        this.scene.start("MainScene");
      }
    });
  }
}
