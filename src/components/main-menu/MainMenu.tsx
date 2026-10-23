import "./MainMenu.css";
import { useGameStore } from "../../shared/store/gameStore";

export const MainMenu = () => {
  const { setGameStatus, countBots, setCountBots } = useGameStore();
  return (
    <div className="ui-overlay">
      <h1>ТАНКИ ОНЛАЙН</h1>
      <div className="menu-buttons">
        <div className="menu-buttons__item">
          <button
            className="menu-buttons__button"
            onClick={() => setGameStatus("singlePlayer")}
          >
            Одиночная игра
          </button>
          <div className="count-bots">
            <button
              className="menu-buttons__button button_count "
              onClick={() => setCountBots(countBots === 2 ? 2 : countBots - 1)}
            >
              -
            </button>
            Количество ботов{" "}
            <span style={{ fontSize: "25px" }}>{countBots}</span>
            <button
              className="menu-buttons__button button_count "
              onClick={() => setCountBots(countBots === 5 ? 5 : countBots + 1)}
            >
              +
            </button>
          </div>
        </div>

        <div className="menu-buttons__item">
          <button
            className="menu-buttons__button"
            onClick={() => setGameStatus("multiPlayer")}
          >
            Мультиплеер
          </button>
        </div>
      </div>
    </div>
  );
};
