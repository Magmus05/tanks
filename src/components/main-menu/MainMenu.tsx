/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
// import "./MainMenu.css";
// import { useGameStore } from "../../shared/store/gameStore";

// export const MainMenu = () => {
//   const { setGameStatus, countBots, setCountBots } = useGameStore();
//   return (
//     <div className="ui-overlay">
//       <h1>ТАНКИ ОНЛАЙН</h1>
//       <div className="menu-buttons">
//         <div className="menu-buttons__item">
//           <button
//             className="menu-buttons__button"
//             onClick={() => setGameStatus("singlePlayer")}
//           >
//             Одиночная игра
//           </button>
//           <div className="count-bots">
//             <button
//               className="menu-buttons__button button_count "
//               onClick={() => setCountBots(countBots === 2 ? 2 : countBots - 1)}
//             >
//               -
//             </button>
//             Количество ботов{" "}
//             <span style={{ fontSize: "25px" }}>{countBots}</span>
//             <button
//               className="menu-buttons__button button_count "
//               onClick={() => setCountBots(countBots === 5 ? 5 : countBots + 1)}
//             >
//               +
//             </button>
//           </div>
//         </div>

//         <div className="menu-buttons__item">
//           <button
//             className="menu-buttons__button"
//             onClick={() => setGameStatus("multiPlayer")}
//           >
//             Мультиплеер
//           </button>
//         </div>
//       </div>
//     </div>
//   );
// };

import "./MainMenu.css";
import { useState, useEffect } from "react";
import { useGameStore } from "../../shared/store/gameStore";
import { io, Socket } from "socket.io-client";

let socket: Socket | null = null; // Сирилизованная ссылка на сокет

export const MainMenu = () => {
  const {
    setGameStatus,
    countBots,
    setCountBots,
    gameStatus,
    lobbyPlayers,
    setLobbyPlayers,
    isHost,
    setIsHost,
  } = useGameStore();

  const [playerName, setPlayerName] = useState("");
  const [isConnected, setIsConnected] = useState(false);

  const startGame = () => {
    setGameStatus("multiPlayer");
  };

  // Подключение к лобби сервера
  const connectToLobby = () => {
    if (!playerName.trim()) return alert("Введите имя!");

    socket = io("http://localhost:3000");
    // socket = io("http://192.168.88.216:3000");
    socket.on("connect", () => {
      setIsConnected(true);
      socket?.emit("joinLobby", { name: playerName });
    });

    socket.on("lobbyUpdate", (players: any[]) => {
      setLobbyPlayers(players);
      // Проверяем, являемся ли мы хостом

      const me = players.find((p) => p.id === socket?.id);
      if (me) setIsHost(me.isHost);
    });

    // Слушаем команду от Хоста на старт игры
    socket.on("gameStartedByHost", () => {
      setGameStatus("multiPlayer");
    });
  };

  const handleStartMultiplayerGame = () => {
    socket?.emit("startNetworkGame");
  };

  // Отключаемся от сокетов, если компонент размонтирован без старта игры
  useEffect(() => {
    return () => {
      if (socket && gameStatus !== "multiPlayer") {
        socket.disconnect();
      }
    };
  }, [gameStatus]);

  return (
    <div className="ui-overlay">
      {/* <h1>ТАНКИ ОНЛАЙН</h1> */}
      <div className="menu-buttons">
        {/* ОДИНОЧНАЯ ИГРА */}
        <div className="menu-buttons__item">
          <button
            className="menu-buttons__button"
            onClick={() => {
              setGameStatus("singlePlayer");
            }}
          >
            Одиночная игра
          </button>
          <div className="count-bots">
            <button
              className="menu-buttons__button button_count"
              onClick={() => setCountBots(countBots === 2 ? 2 : countBots - 1)}
            >
              -
            </button>
            Количество ботов{" "}
            <span style={{ fontSize: "25px" }}>{countBots}</span>
            <button
              className="menu-buttons__button button_count"
              onClick={() => setCountBots(countBots === 5 ? 5 : countBots + 1)}
            >
              +
            </button>
          </div>
        </div>

        {/* МУЛЬТИПЛЕЕР */}
        <div className="menu-buttons__item">
          <h3 style={{ margin: "10px 0" }}>Мультиплеерный режим</h3>

          {!isConnected ? (
            <div className="connect-form">
              <input
                type="text"
                placeholder="Ваше имя"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="lobby-input"
              />
              <button
                className="menu-buttons__button"
                // onClick={connectToLobby}
                onClick={startGame}
              >
                Подключиться к серверу
              </button>
            </div>
          ) : (
            <div className="lobby-window">
              <h4>Подключено игроков: {lobbyPlayers.length}</h4>
              <ul className="players-list">
                {lobbyPlayers.map((player) => (
                  <li
                    key={player.id}
                    className={player.id === socket?.id ? "me" : ""}
                  >
                    {player.name}{" "}
                    {player.isHost && (
                      <span className="host-badge">👑 Лидер</span>
                    )}
                  </li>
                ))}
              </ul>

              {isHost ? (
                <button
                  className="menu-buttons__button start-btn"
                  onClick={handleStartMultiplayerGame}
                >
                  В БОЙ 🚀
                </button>
              ) : (
                <div className="wait-msg">
                  Ожидание, пока лидер запустит бой...
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Экспортируем сокет наружу, чтобы сцена MainSceneMultiPlayer могла использовать то же самое соединение!
export { socket as networkSocket };
