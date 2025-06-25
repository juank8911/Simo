import React from 'react';
import Sidebar from '../Sidebar/Sidebar.jsx';
import styles from '../../App.module.css';

const Layout = ({ children, allExchanges, onExchangeChange, loading, error }) => (
  <div className={styles.layout}>
    <Sidebar
      allExchanges={allExchanges}
      onExchangeChange={onExchangeChange}
      loading={loading}
      error={error}
    />
    <main className={styles.main}>
      {children}
    </main>
  </div>
);

export default Layout;