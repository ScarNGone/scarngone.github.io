import UIKit

/// Message bref affiché en bas de l'écran, puis effacé.
final class ToastView: UIView {
    private let label = UILabel()

    override init(frame: CGRect) {
        super.init(frame: frame)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = UIColor.label.withAlphaComponent(0.88)
        layer.cornerRadius = 18
        layer.cornerCurve = .continuous
        alpha = 0
        isUserInteractionEnabled = false

        label.translatesAutoresizingMaskIntoConstraints = false
        label.textColor = .systemBackground
        label.font = .preferredFont(forTextStyle: .footnote)
        label.adjustsFontForContentSizeCategory = true
        label.textAlignment = .center
        label.numberOfLines = 2
        addSubview(label)

        NSLayoutConstraint.activate([
            label.topAnchor.constraint(equalTo: topAnchor, constant: 9),
            label.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -9),
            label.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16),
            label.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -16),
        ])
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) n'est pas utilisé")
    }

    func show(_ text: String) {
        label.text = text
        UIAccessibility.post(notification: .announcement, argument: text)
        NSObject.cancelPreviousPerformRequests(withTarget: self, selector: #selector(fadeOut), object: nil)
        UIView.animate(withDuration: 0.2) {
            self.alpha = 1
        }
        perform(#selector(fadeOut), with: nil, afterDelay: 1.8)
    }

    @objc private func fadeOut() {
        UIView.animate(withDuration: 0.3) {
            self.alpha = 0
        }
    }
}

/// Écran d'information qui recouvre la page quand elle ne peut pas s'afficher.
final class NoticeView: UIView {
    struct Action {
        let title: String
        let isPrimary: Bool
        let handler: () -> Void
    }

    private let titleLabel = UILabel()
    private let messageLabel = UILabel()
    private let buttons = UIStackView()

    override init(frame: CGRect) {
        super.init(frame: frame)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = .systemBackground
        isHidden = true

        titleLabel.font = .preferredFont(forTextStyle: .headline)
        titleLabel.adjustsFontForContentSizeCategory = true
        titleLabel.textAlignment = .center
        titleLabel.numberOfLines = 0

        messageLabel.font = .preferredFont(forTextStyle: .subheadline)
        messageLabel.adjustsFontForContentSizeCategory = true
        messageLabel.textColor = .secondaryLabel
        messageLabel.textAlignment = .center
        messageLabel.numberOfLines = 0

        buttons.axis = .vertical
        buttons.spacing = 10

        let content = UIStackView(arrangedSubviews: [titleLabel, messageLabel, buttons])
        content.translatesAutoresizingMaskIntoConstraints = false
        content.axis = .vertical
        content.spacing = 10
        content.setCustomSpacing(24, after: messageLabel)
        addSubview(content)

        NSLayoutConstraint.activate([
            content.centerYAnchor.constraint(equalTo: centerYAnchor),
            content.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 28),
            content.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -28),
            content.topAnchor.constraint(greaterThanOrEqualTo: topAnchor, constant: 16),
            content.bottomAnchor.constraint(lessThanOrEqualTo: bottomAnchor, constant: -16),
        ])
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) n'est pas utilisé")
    }

    func show(title: String, message: String, actions: [Action]) {
        titleLabel.text = title
        messageLabel.text = message

        for button in buttons.arrangedSubviews {
            button.removeFromSuperview()
        }
        for action in actions {
            var configuration: UIButton.Configuration = action.isPrimary ? .filled() : .gray()
            configuration.buttonSize = .large
            configuration.cornerStyle = .large
            let handler = action.handler
            let button = UIButton(
                configuration: configuration,
                primaryAction: UIAction(title: action.title) { _ in handler() }
            )
            buttons.addArrangedSubview(button)
        }

        isHidden = false
        UIAccessibility.post(notification: .screenChanged, argument: titleLabel)
    }

    func hide() {
        isHidden = true
    }
}
