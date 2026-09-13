/** @jsxImportSource preact */
export default function Layout(props) {
  return (
    <div>
      {
        /* <h1>
        <a href="/">
          Home
        </a>
      </h1> */
      }

      <div>
        {props.children}
      </div>
    </div>
  )
}
