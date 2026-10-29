import "./App.css";
import { GameBar } from "./components/game-bar/GameBar";
import { MainMenu } from "./components/main-menu/MainMenu";
import { PhaserGame } from "./game/PhaserGame";
import { useGameStore } from "./shared/store/gameStore";

function App() {
  // Забираем статус игры и состояние загрузки из Zustand
  const { gameStatus, isAssetsLoaded } = useGameStore();

  const showHUD =
    (gameStatus === "singlePlayer" && isAssetsLoaded) ||
    (gameStatus === "multiPlayer" && isAssetsLoaded);
  // Определяем, нужно ли показать экран загрузки:
  // Если игрок ХОЧЕТ играть (playing), но ассеты ЕЩЕ НЕ скачались (false)
  const showLoading =
    (gameStatus === "singlePlayer" && !isAssetsLoaded) ||
    (gameStatus === "multiPlayer" && !isAssetsLoaded);

  return (
    <div
      className="app"
      style={{
        position: "relative",
        margin: "0 auto",
      }}
    >
      {/* 1. ЭКРАН ЗАГРУЗКИ: Показывается ТОЛЬКО если игрок нажал Старт, а файлы еще качаются */}
      {showLoading && (
        <div className="loading-screen">Загрузка ресурсов игры...</div>
      )}

      {/* 2. ГЛАВНОЕ МЕНЮ: Скрывается сразу при нажатии кнопки */}
      {gameStatus === "menu" && <MainMenu />}

      {/* 3. ИГРОВОЙ ИНТЕРФЕЙС (HUD): Показывается поверх запущенного боя */}
      {showHUD && <GameBar />}

      {/* Блок Phaser всегда работает на заднем плане */}
      <div style={{ width: "100%", height: "100%" }}>
        <PhaserGame />
      </div>
    </div>
  );
}

export default App;
