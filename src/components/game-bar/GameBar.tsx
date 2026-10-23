import "./GameBar.css";
import { useGameStore } from "../../shared/store/gameStore";

export const GameBar = () => {
  const { hp, bulletsCount, score, countsHit, setGameStatus } = useGameStore();

  return (
    <div className="game-hud">
      <div className="hud-item hp-bar">
        <span>Жизни:</span>
        <div className="bar-bg">
          <div className="bar-fill" style={{ width: `${hp}%` }}></div>
        </div>
        <span className="bar-text">{hp}/100</span>
      </div>
      <div className="hud-item">
        <span>Снаряды:</span> <strong>{bulletsCount}</strong>
      </div>
      <div className="hud-item">
        <span>Уничтожено:</span> <strong>{score}</strong>
      </div>
      <div className="hud-item">
        <span>Попаданий:</span> <strong>{countsHit}</strong>
      </div>

      <div className="hud-item">
        <button className="button-exit" onClick={() => setGameStatus("menu")}>
          Выход
        </button>
      </div>
    </div>
  );
};
