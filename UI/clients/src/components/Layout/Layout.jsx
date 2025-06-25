import React from 'react';
import Sidebar from '../Sidebar/Sidebar.jsx';
import { Outlet } from 'react-router-dom';
import styles from '../../App.module.css';

const Layout = ({ allExchanges, setAllExchanges }) => (
  <div className={styles.layout}>
    <Sidebar allExchanges={allExchanges} setAllExchanges={setAllExchanges} />
    <main className={styles.main}>
      <Outlet />
    </main>
  </div>
);

export default Layout;