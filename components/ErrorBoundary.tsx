
import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public handleReset = () => {
      // Clear potentially corrupted local storage
      localStorage.removeItem('category_order');
      localStorage.removeItem('recipes_cache');
      window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#f2f4f7] dark:bg-[#0f1115] p-5 text-center">
          <div className="text-4xl mb-4">🤕</div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Что-то пошло не так</h1>
          <p className="text-sm text-gray-500 mb-6 max-w-xs mx-auto">
            Произошла ошибка при отрисовке интерфейса. Попробуйте обновить страницу.
          </p>
          <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl mb-6 max-w-sm w-full overflow-hidden">
              <code className="text-[10px] text-red-600 dark:text-red-400 block break-words text-left">
                  {this.state.error?.toString()}
              </code>
          </div>
          <button 
            onClick={this.handleReset}
            className="bg-gray-900 dark:bg-white text-white dark:text-black font-bold py-3 px-6 rounded-xl shadow-lg active:scale-95 transition"
          >
            Сбросить кеш и обновить
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
