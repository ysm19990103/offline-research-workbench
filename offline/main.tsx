import React from 'react';
import {createRoot} from 'react-dom/client';
import Workbench from '../app/workbench';
import '../app/globals.css';
class ErrorBoundary extends React.Component<{children:React.ReactNode},{error:string}> {
 state={error:''};
 static getDerivedStateFromError(error:Error){return {error:error.message};}
 render(){if(this.state.error)return <main style={{padding:40,fontFamily:'system-ui',maxWidth:700,margin:'auto'}}><h1>工作台暂时无法打开</h1><p>请使用较新版本的 Chrome 或 Edge 打开，并确认允许浏览器保存本地数据。</p><p>{this.state.error}</p><button onClick={()=>location.reload()}>重新打开</button></main>;return this.props.children;}
}
const root=document.getElementById('root');
if(root)createRoot(root).render(<ErrorBoundary><Workbench/></ErrorBoundary>);
