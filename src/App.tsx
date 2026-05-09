export function App() {
  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">tarobot</h1>
        <p className="app__subtitle">she sees you</p>
      </header>

      <main className="app__main">
        <pre className="app__ascii">{ASCII_PLACEHOLDER}</pre>
        <p className="app__status">scaffold ready · cognition pipeline pending</p>
      </main>
    </div>
  );
}

const ASCII_PLACEHOLDER = String.raw`
        .---.
       /     \
      | () () |
       \  ^  /
        |||||
        |||||
`;
