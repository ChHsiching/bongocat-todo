# Homebrew Cask for BongoCat Todo (fork of BongoCat).
# This file lives in this repo at packaging/homebrew/bongo-cat-todo.rb as the
# source of truth. CI (update-packaging.yml) copies it to the ChHsiching/homebrew-tap
# repo at Casks/bongo-cat-todo.rb, rewriting version + sha256 for each arch on
# release. Users install via:
#   brew tap ChHsiching/tap
#   brew install --cask bongo-cat-todo

cask "bongo-cat-todo" do
  arch arm: "aarch64", intel: "x64"

  version "1.3.0"

  on_arm do
    sha256 "0000000000000000000000000000000000000000000000000000000000000000"
  end
  on_intel do
    sha256 "0000000000000000000000000000000000000000000000000000000000000000"
  end

  url "https://github.com/ChHsiching/bongocat-todo/releases/download/v#{version}/BongoCat.Todo_#{version}_#{arch}.dmg",
      verified: "github.com/ChHsiching/bongocat-todo/"
  name "BongoCat Todo"
  desc "Tauri 2 desktop pet cat with a todo list and mail notifier"
  homepage "https://github.com/ChHsiching/bongocat-todo"

  # The .dmg ships a BongoCat Todo.app bundle.
  app "BongoCat Todo.app"

  zap trash: [
    "~/Library/Application Support/com.chhsiching.bongocat-todo",
    "~/Library/Preferences/com.chhsiching.bongocat-todo.plist",
    "~/Library/Saved Application State/com.chhsiching.bongocat-todo.savedState",
    "~/Library/Logs/BongoCat Todo",
  ]
end
